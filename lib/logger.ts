import type { OpencodeClient } from "@opencode-ai/sdk";
import { appendFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PLUGIN_NAME } from "./constants.js";
import { ensureDirectory, getOpenCodePath } from "./utils/file-system-utils.js";

export const LOGGING_ENABLED = process.env.ENABLE_PLUGIN_REQUEST_LOGGING === "1";
const DEBUG_FLAG_ENABLED = process.env.DEBUG_CODEX_PLUGIN === "1";
const DEBUG_ENABLED = DEBUG_FLAG_ENABLED || LOGGING_ENABLED;
const CONSOLE_LOGGING_ENABLED = DEBUG_FLAG_ENABLED;
const LOG_DIR = getOpenCodePath("logs", "codex-plugin");
const ROLLING_LOG_FILE = join(LOG_DIR, "codex-plugin.log");

const LOG_ROTATION_MAX_BYTES = Math.max(1, getEnvNumber("CODEX_LOG_MAX_BYTES", 5 * 1024 * 1024));
const LOG_ROTATION_MAX_FILES = Math.max(1, getEnvNumber("CODEX_LOG_MAX_FILES", 5));
const LOG_QUEUE_MAX_LENGTH = Math.max(1, getEnvNumber("CODEX_LOG_QUEUE_MAX", 1000));

type LogLevel = "debug" | "info" | "warn" | "error";

type LoggerOptions = {
	client?: OpencodeClient;
	directory?: string;
};

type RollingLogEntry = {
	timestamp: string;
	service: string;
	level: LogLevel;
	message: string;
	extra?: Record<string, unknown>;
};

let requestCounter = 0;
let loggerClient: OpencodeClient | undefined;
let projectDirectory: string | undefined;
let announcedState = false;

const writeQueue: string[] = [];
let flushInProgress = false;
let flushScheduled = false;
let overflowNotified = false;
let pendingFlush: Promise<void> | undefined;
let currentLogSize = 0;
let sizeInitialized = false;

export function configureLogger(options: LoggerOptions = {}): void {
	if (options.client) {
		loggerClient = options.client;
	}
	if (options.directory) {
		projectDirectory = options.directory;
	}
	if (announcedState || !(LOGGING_ENABLED || DEBUG_ENABLED)) {
		return;
	}
	if (LOGGING_ENABLED) {
		ensureLogDir();
	}
	announcedState = true;
	const message = LOGGING_ENABLED
		? "Codex plugin request logging enabled"
		: "Codex plugin debug logging enabled";
	emit(LOGGING_ENABLED ? "info" : "debug", message, {
		directory: projectDirectory,
		logDir: LOGGING_ENABLED ? LOG_DIR : undefined,
	});
}

export function logRequest(stage: string, data: Record<string, unknown>): void {
	const payload = {
		timestamp: new Date().toISOString(),
		requestId: ++requestCounter,
		stage,
		...data,
	};
	const filePath = persistRequestStage(stage, payload);
	const extra: Record<string, unknown> = {
		stage,
		requestId: payload.requestId,
	};
	if (filePath) {
		extra.path = filePath;
	}
	emit("debug", `request.${stage}`, extra);
}

export function logDebug(message: string, data?: unknown): void {
	emit("debug", message, normalizeExtra(data));
}

export function logInfo(message: string, data?: unknown): void {
	emit("info", message, normalizeExtra(data));
}

export function logWarn(message: string, data?: unknown): void {
	emit("warn", message, normalizeExtra(data));
}

export function logError(message: string, data?: unknown): void {
	emit("error", message, normalizeExtra(data));
}

export async function flushRollingLogsForTest(): Promise<void> {
	scheduleFlush();
	if (pendingFlush) {
		await pendingFlush;
	}
}

function emit(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
	const sanitizedExtra = sanitizeExtra(extra);
	const entry: RollingLogEntry = {
		timestamp: new Date().toISOString(),
		service: PLUGIN_NAME,
		level,
		message,
		extra: sanitizedExtra,
	};
	appendRollingLog(entry);

	if (loggerClient?.app) {
		void loggerClient.app
			.log({
				body: entry,
				query: projectDirectory ? { directory: projectDirectory } : undefined,
			})
			.catch((error) =>
				logToConsole("warn", "Failed to forward log entry", {
					error: toErrorMessage(error),
				}),
			);
	}

	logToConsole(level, message, sanitizedExtra);
}

function logToConsole(
	level: LogLevel,
	message: string,
	extra?: Record<string, unknown>,
	error?: unknown,
): void {
	const shouldLog = CONSOLE_LOGGING_ENABLED || level === "warn" || level === "error";
	if (!shouldLog) {
		return;
	}
	const prefix = `[${PLUGIN_NAME}] ${message}`;
	const details = extra ? `${prefix} ${JSON.stringify(extra)}` : prefix;
	if (level === "error") {
		console.error(details, error ?? "");
		return;
	}
	if (level === "warn") {
		console.warn(details);
		return;
	}
	console.log(details);
}

function normalizeExtra(data?: unknown): Record<string, unknown> | undefined {
	if (data === undefined) return undefined;
	if (data && typeof data === "object" && !Array.isArray(data)) {
		return data as Record<string, unknown>;
	}
	return { detail: data };
}

function sanitizeExtra(extra?: Record<string, unknown>): Record<string, unknown> | undefined {
	if (!extra) return undefined;
	return Object.fromEntries(
		Object.entries(extra).filter(([, value]) => value !== undefined && value !== null),
	);
}

function ensureLogDir(): void {
	ensureDirectory(LOG_DIR);
}

function persistRequestStage(stage: string, payload: Record<string, unknown>): string | undefined {
	try {
		ensureLogDir();
		const filename = join(LOG_DIR, `request-${payload.requestId}-${stage}.json`);
		void writeFile(filename, JSON.stringify(payload, null, 2), "utf8").catch((error) => {
			logToConsole("warn", "Failed to persist request log", {
				stage,
				error: toErrorMessage(error),
			});
		});
		return filename;
	} catch (err) {
		logToConsole("warn", "Failed to prepare request log", {
			stage,
			error: toErrorMessage(err),
		});
		return undefined;
	}
}

function appendRollingLog(entry: RollingLogEntry): void {
	const line = `${JSON.stringify(entry)}\n`;
	enqueueLogLine(line);
}

function enqueueLogLine(line: string): void {
	if (writeQueue.length >= LOG_QUEUE_MAX_LENGTH) {
		writeQueue.shift();
		if (!overflowNotified) {
			overflowNotified = true;
			logToConsole("warn", "Rolling log queue overflow; dropping oldest entries", {
				maxQueueLength: LOG_QUEUE_MAX_LENGTH,
			});
		}
	}
	writeQueue.push(line);
	scheduleFlush();
}

function scheduleFlush(): void {
	if (flushScheduled || flushInProgress) {
		return;
	}
	flushScheduled = true;
	pendingFlush = Promise.resolve()
		.then(flushQueue)
		.catch((error) =>
			logToConsole("warn", "Failed to flush rolling logs", {
				error: toErrorMessage(error),
			}),
		);
}

async function flushQueue(): Promise<void> {
	if (flushInProgress) return;
	flushInProgress = true;
	flushScheduled = false;

	try {
		ensureLogDir();
		while (writeQueue.length) {
			const chunk = writeQueue.join("");
			writeQueue.length = 0;
			const chunkBytes = Buffer.byteLength(chunk, "utf8");
			await maybeRotate(chunkBytes);
			await appendFile(ROLLING_LOG_FILE, chunk, "utf8");
			currentLogSize += chunkBytes;
		}
	} catch (err) {
		logToConsole("warn", "Failed to write rolling log", {
			error: toErrorMessage(err),
		});
	} finally {
		flushInProgress = false;
		if (writeQueue.length) {
			scheduleFlush();
		} else {
			overflowNotified = false;
		}
	}
}

async function maybeRotate(incomingBytes: number): Promise<void> {
	await ensureLogSize();
	if (currentLogSize + incomingBytes <= LOG_ROTATION_MAX_BYTES) {
		return;
	}
	await rotateLogs();
	currentLogSize = 0;
}

async function ensureLogSize(): Promise<void> {
	if (sizeInitialized) return;
	try {
		const stats = await stat(ROLLING_LOG_FILE);
		currentLogSize = stats.size;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "ENOENT") {
			logToConsole("warn", "Failed to stat rolling log", { error: toErrorMessage(error) });
		}
		currentLogSize = 0;
	} finally {
		sizeInitialized = true;
	}
}

async function rotateLogs(): Promise<void> {
	const oldest = `${ROLLING_LOG_FILE}.${LOG_ROTATION_MAX_FILES}`;
	try {
		await rm(oldest, { force: true });
	} catch {
		/* ignore */
	}
	for (let index = LOG_ROTATION_MAX_FILES - 1; index >= 1; index -= 1) {
		const source = `${ROLLING_LOG_FILE}.${index}`;
		const target = `${ROLLING_LOG_FILE}.${index + 1}`;
		try {
			await rename(source, target);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
				throw error;
			}
		}
	}
	try {
		await rename(ROLLING_LOG_FILE, `${ROLLING_LOG_FILE}.1`);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
}

function getEnvNumber(name: string, fallback: number): number {
	const raw = process.env[name];
	const parsed = raw ? Number(raw) : Number.NaN;
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return String(error);
}
