import type { OpencodeClient } from "@opencode-ai/sdk";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { PLUGIN_NAME } from "./constants.js";

export const LOGGING_ENABLED = process.env.ENABLE_PLUGIN_REQUEST_LOGGING === "1";
const DEBUG_ENABLED = process.env.DEBUG_CODEX_PLUGIN === "1" || LOGGING_ENABLED;
const LOG_DIR = join(homedir(), ".opencode", "logs", "codex-plugin");

type LogLevel = "debug" | "info" | "warn" | "error";

type LoggerOptions = {
	client?: OpencodeClient;
	directory?: string;
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
	if (!LOGGING_ENABLED) return;
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
	if (!DEBUG_ENABLED) return;
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
	const payload = {
		service: PLUGIN_NAME,
		level,
		message,
		extra: sanitizeExtra(extra),
	};
	if (loggerClient?.app) {
		void loggerClient.app
			.log({
				body: payload,
				query: projectDirectory ? { directory: projectDirectory } : undefined,
			})
			.catch((error) => fallback(level, message, payload.extra, error));
		return;
	}
	fallback(level, message, payload.extra);
}

function fallback(level: LogLevel, message: string, extra?: Record<string, unknown>, error?: unknown): void {
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
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true });
	}
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
