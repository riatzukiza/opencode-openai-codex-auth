import type { OpencodeClient } from "@opencode-ai/sdk";
import { writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_NAME } from "./constants.js";
import { ensureDirectory, getOpenCodePath } from "./utils/file-system-utils.js";

export const LOGGING_ENABLED = process.env.ENABLE_PLUGIN_REQUEST_LOGGING === "1";
const DEBUG_FLAG_ENABLED = process.env.DEBUG_CODEX_PLUGIN === "1";
const DEBUG_ENABLED = DEBUG_FLAG_ENABLED || LOGGING_ENABLED;
const CONSOLE_LOGGING_ENABLED = LOGGING_ENABLED || DEBUG_FLAG_ENABLED;
const LOG_DIR = getOpenCodePath("logs", "codex-plugin");
const ROLLING_LOG_FILE = join(LOG_DIR, "codex-plugin.log");
const IS_TEST_ENV = process.env.VITEST === "1" || process.env.NODE_ENV === "test";

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
					error: error instanceof Error ? error.message : String(error),
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
	if (IS_TEST_ENV && !shouldLog) {
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
		writeFileSync(filename, JSON.stringify(payload, null, 2), "utf8");
		return filename;
	} catch (err) {
		emit("warn", "Failed to persist request log", {
			stage,
			error: err instanceof Error ? err.message : String(err),
		});
		return undefined;
	}
}

function appendRollingLog(entry: RollingLogEntry): void {
	try {
		ensureLogDir();
		appendFileSync(ROLLING_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
	} catch (err) {
		logToConsole("warn", "Failed to write rolling log", {
			error: err instanceof Error ? err.message : String(err),
		});
	}
}
