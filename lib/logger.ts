import type { OpencodeClient } from "@opencode-ai/sdk";
import { appendFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LoggingConfig, PluginConfig } from "./types.js";
import { PLUGIN_NAME } from "./constants.js";
import { ensureDirectory, getOpenCodePath } from "./utils/file-system-utils.js";

const IS_TEST_ENV = process.env.NODE_ENV === "test";
const LOG_DIR = getOpenCodePath("logs", "codex-plugin");
const ROLLING_LOG_FILE = join(LOG_DIR, "codex-plugin.log");

const envLoggingDefaults = {
	loggingEnabled: process.env.ENABLE_PLUGIN_REQUEST_LOGGING === "1",
	debugFlagEnabled: process.env.DEBUG_CODEX_PLUGIN === "1",
	showWarningToasts: process.env.CODEX_SHOW_WARNING_TOASTS === "1",
	logRotationMaxBytes: getEnvNumber("CODEX_LOG_MAX_BYTES", 5 * 1024 * 1024),
	logRotationMaxFiles: getEnvNumber("CODEX_LOG_MAX_FILES", 5),
	logQueueMaxLength: getEnvNumber("CODEX_LOG_QUEUE_MAX", 1000),
};

let LOGGING_ENABLED = envLoggingDefaults.loggingEnabled;
export function isLoggingEnabled(): boolean {
	return LOGGING_ENABLED;
}
let DEBUG_FLAG_ENABLED = envLoggingDefaults.debugFlagEnabled;
let WARN_TOASTS_ENABLED = envLoggingDefaults.showWarningToasts ?? false;
let LOG_ROTATION_MAX_BYTES = Math.max(1, envLoggingDefaults.logRotationMaxBytes);
let LOG_ROTATION_MAX_FILES = Math.max(1, envLoggingDefaults.logRotationMaxFiles);
let LOG_QUEUE_MAX_LENGTH = Math.max(1, envLoggingDefaults.logQueueMaxLength);
let DEBUG_ENABLED = DEBUG_FLAG_ENABLED || LOGGING_ENABLED;
let CONSOLE_LOGGING_ENABLED = DEBUG_FLAG_ENABLED && !IS_TEST_ENV;

type LogLevel = "debug" | "info" | "warn" | "error";

type LoggerOptions = {
	client?: OpencodeClient;
	directory?: string;
	pluginConfig?: PluginConfig;
};

type OpencodeClientWithTui = OpencodeClient & {
	tui?: {
		showToast?: (args: { message: string; variant?: "success" | "error" | "warning" | "info" }) => void;
	};
};

function hasTuiShowToast(client: OpencodeClient): client is OpencodeClientWithTui {
	return (
		"tui" in client &&
		typeof client.tui === "object" &&
		client.tui !== null &&
		typeof client.tui?.showToast === "function"
	);
}

type RollingLogEntry = {
	timestamp: string;
	service: string;
	level: LogLevel;
	message: string;
	extra?: Record<string, unknown>;
};

function refreshLoggingState(): void {
	DEBUG_ENABLED = DEBUG_FLAG_ENABLED || LOGGING_ENABLED;
	CONSOLE_LOGGING_ENABLED = DEBUG_FLAG_ENABLED && !IS_TEST_ENV;
}

function ensurePositiveNumber(value: number | undefined, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}
	return fallback;
}

function applyLoggingOverrides(logging?: LoggingConfig): void {
	if (!logging) {
		refreshLoggingState();
		return;
	}

	LOGGING_ENABLED = logging.enableRequestLogging ?? LOGGING_ENABLED;
	DEBUG_FLAG_ENABLED = logging.debug ?? DEBUG_FLAG_ENABLED;
	WARN_TOASTS_ENABLED = logging.showWarningToasts ?? WARN_TOASTS_ENABLED;
	LOG_ROTATION_MAX_BYTES = ensurePositiveNumber(logging.logMaxBytes, LOG_ROTATION_MAX_BYTES);
	LOG_ROTATION_MAX_FILES = ensurePositiveNumber(logging.logMaxFiles, LOG_ROTATION_MAX_FILES);
	LOG_QUEUE_MAX_LENGTH = ensurePositiveNumber(logging.logQueueMax, LOG_QUEUE_MAX_LENGTH);
	refreshLoggingState();
}

refreshLoggingState();

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
	applyLoggingOverrides(options.pluginConfig?.logging);
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
	const shouldPersist = LOGGING_ENABLED || DEBUG_ENABLED;
	const filePath = shouldPersist ? persistRequestStage(stage, payload) : undefined;
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
	const supportsToast = loggerClient ? hasTuiShowToast(loggerClient) : false;
	const warnToastEnabled = supportsToast && WARN_TOASTS_ENABLED;
	const entry: RollingLogEntry = {
		timestamp: new Date().toISOString(),
		service: PLUGIN_NAME,
		level,
		message,
		extra: sanitizedExtra,
	};

	if (LOGGING_ENABLED || DEBUG_ENABLED) {
		appendRollingLog(entry);
	}

	const shouldForwardToAppLog = level !== "warn" || !warnToastEnabled;

	if (shouldForwardToAppLog && loggerClient?.app?.log) {
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

	if (level === "error" || (level === "warn" && warnToastEnabled)) {
		notifyToast(level, message, sanitizedExtra);
	}

	const shouldLogToConsole = level !== "warn" || !warnToastEnabled;
	if (shouldLogToConsole) {
		logToConsole(level, message, sanitizedExtra);
	}
}

/**
 * Sends a user-facing notification (toast) through the configured logger client, if available.
 *
 * Constructs a payload with a title derived from the log level, the provided message as the body,
 * and optional extra metadata, then attempts to call `app.notify` or `app.toast`. If no app or
 * compatible send method is present, the function returns without action. Failures to send are
 * recorded as a warning via console logging.
 *
 * @param level - The severity level for the notification (`"debug" | "info" | "warn" | "error"`). A value of `"error"` produces an "error" title; other values produce a "warning" title.
 * @param message - The primary text to show in the notification body.
 * @param extra - Optional metadata to include with the notification payload.
 */
function notifyToast(level: LogLevel, message: string, _extra?: Record<string, unknown>): void {
	if (!loggerClient?.tui?.showToast) return;

	const variant = level === "error" ? "error" : "warning";
	const wrappedMessage = wrapToastMessage(`${PLUGIN_NAME}: ${message}`);

	try {
		void loggerClient.tui.showToast({
			body: {
				title: level === "error" ? `${PLUGIN_NAME} error` : `${PLUGIN_NAME} warning`,
				message: wrappedMessage,
				variant,
			},
		});
	} catch (err: unknown) {
		logToConsole("warn", "Failed to send plugin toast", { error: toErrorMessage(err) });
	}
}

function wrapToastMessage(message: string, maxWidth = 72): string {
	if (message.length <= maxWidth) return message;

	const expandedWords = message
		.split(/\s+/)
		.filter(Boolean)
		.flatMap((word) => {
			if (word.length <= maxWidth) return word;

			const chunks: string[] = [];
			for (let index = 0; index < word.length; index += maxWidth) {
				chunks.push(word.slice(index, index + maxWidth));
			}
			return chunks;
		});

	const lines: string[] = [];
	let current = "";

	for (const word of expandedWords) {
		if (current.length === 0) {
			current = word;
			continue;
		}
		const nextLength = current.length + 1 + word.length;
		if (nextLength <= maxWidth) {
			current = `${current} ${word}`;
			continue;
		}
		lines.push(current);
		current = word;
	}

	if (current) {
		lines.push(current);
	}

	return lines.join("\n");
}

/**
 * Writes a plugin-prefixed log message to the console when the log level is applicable.
 *
 * Logs warnings and errors unconditionally; debug and info messages are written only when console logging is enabled. The message is prefixed with the plugin name and, if provided, `extra` is JSON-stringified and appended; on JSON serialization failure, `String(extra)` is appended instead.
 *
 * @param level - Log level determining severity and console method
 * @param message - Primary log message text
 * @param extra - Additional context appended to the message; values are JSON-stringified when possible
 */
function logToConsole(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
	const isWarnOrError = level === "warn" || level === "error";
	const shouldLogDebugOrInfo = CONSOLE_LOGGING_ENABLED && (level === "debug" || level === "info");
	const shouldLog = isWarnOrError || shouldLogDebugOrInfo;
	if (!shouldLog) {
		return;
	}
	const prefix = `[${PLUGIN_NAME}] ${message}`;
	let details = prefix;
	if (extra) {
		try {
			details = `${prefix} ${JSON.stringify(extra)}`;
		} catch {
			// Fallback to a best-effort representation instead of throwing from logging
			details = `${prefix} ${String(extra)}`;
		}
	}
	if (level === "error") {
		console.error(details);
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
