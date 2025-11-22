import type { OpencodeClient } from "@opencode-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMocks = {
	writeFile: vi.fn(),
	appendFile: vi.fn(),
	mkdirSync: vi.fn(),
	existsSync: vi.fn(),
	stat: vi.fn(),
	rename: vi.fn(),
	rm: vi.fn(),
};

vi.mock("node:fs", () => ({
	existsSync: fsMocks.existsSync,
	mkdirSync: fsMocks.mkdirSync,
}));

vi.mock("node:fs/promises", () => ({
	__esModule: true,
	writeFile: fsMocks.writeFile,
	appendFile: fsMocks.appendFile,
	stat: fsMocks.stat,
	rename: fsMocks.rename,
	rm: fsMocks.rm,
}));

vi.mock("node:os", () => ({
	__esModule: true,
	homedir: () => "/mock-home",
}));

const originalEnv = { ...process.env };
let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.resetModules();
	Object.assign(process.env, originalEnv);
	delete process.env.ENABLE_PLUGIN_REQUEST_LOGGING;
	delete process.env.DEBUG_CODEX_PLUGIN;
	delete process.env.CODEX_LOG_MAX_BYTES;
	delete process.env.CODEX_LOG_MAX_FILES;
	delete process.env.CODEX_LOG_QUEUE_MAX;
	fsMocks.writeFile.mockReset();
	fsMocks.appendFile.mockReset();
	fsMocks.mkdirSync.mockReset();
	fsMocks.existsSync.mockReset();
	fsMocks.stat.mockReset();
	fsMocks.rename.mockReset();
	fsMocks.rm.mockReset();
	fsMocks.appendFile.mockResolvedValue(undefined);
	fsMocks.writeFile.mockResolvedValue(undefined);
	fsMocks.stat.mockRejectedValue(Object.assign(new Error("no file"), { code: "ENOENT" }));
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	logSpy.mockRestore();
	warnSpy.mockRestore();
	errorSpy.mockRestore();
});

describe("logger", () => {
	it("isLoggingEnabled reflects env state", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		const { isLoggingEnabled, configureLogger } = await import("../lib/logger.js");
		expect(isLoggingEnabled()).toBe(true);

		// Test that config overrides are reflected
		configureLogger({ pluginConfig: { logging: { enableRequestLogging: false } } });
		expect(isLoggingEnabled()).toBe(false);
	});

	it("logRequest writes stage file and rolling log when enabled", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		fsMocks.existsSync.mockReturnValue(false);
		const { logRequest, flushRollingLogsForTest } = await import("../lib/logger.js");

		logRequest("stage-one", { foo: "bar" });
		await flushRollingLogsForTest();

		expect(fsMocks.mkdirSync).toHaveBeenCalledWith("/mock-home/.opencode/logs/codex-plugin", {
			recursive: true,
		});
		const [requestPath, payload, encoding] = fsMocks.writeFile.mock.calls[0];
		expect(requestPath).toBe("/mock-home/.opencode/logs/codex-plugin/request-1-stage-one.json");
		expect(encoding).toBe("utf8");
		const parsedPayload = JSON.parse(payload as string);
		expect(parsedPayload.stage).toBe("stage-one");
		expect(parsedPayload.foo).toBe("bar");

		const [logPath, logLine, logEncoding] = fsMocks.appendFile.mock.calls[0];
		expect(logPath).toBe("/mock-home/.opencode/logs/codex-plugin/codex-plugin.log");
		expect(logEncoding).toBe("utf8");
		expect(logLine as string).toContain('"stage":"stage-one"');
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("logRequest skips disk writes when logging disabled", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logRequest, flushRollingLogsForTest } = await import("../lib/logger.js");

		logRequest("disabled-stage", { foo: "bar" });
		await flushRollingLogsForTest();

		expect(fsMocks.writeFile).not.toHaveBeenCalled();
		expect(fsMocks.appendFile).not.toHaveBeenCalled();
	});

	it("config overrides env-enabled request logging when disabled in file", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		fsMocks.existsSync.mockReturnValue(true);
		const { configureLogger, logRequest, flushRollingLogsForTest, isLoggingEnabled } = await import(
			"../lib/logger.js"
		);

		configureLogger({ pluginConfig: { logging: { enableRequestLogging: false } } });

		// Verify isLoggingEnabled reflects the config override
		expect(isLoggingEnabled()).toBe(false);

		logRequest("stage-one", { foo: "bar" });
		await flushRollingLogsForTest();

		expect(fsMocks.writeFile).not.toHaveBeenCalled();
		expect(fsMocks.appendFile).not.toHaveBeenCalled();
	});

	it("logDebug appends to rolling log only when enabled", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		fsMocks.existsSync.mockReturnValue(true);
		const { logDebug, flushRollingLogsForTest } = await import("../lib/logger.js");

		logDebug("debug-message", { detail: "info" });
		await flushRollingLogsForTest();

		expect(fsMocks.appendFile).toHaveBeenCalledTimes(1);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("logWarn writes to rolling log but stays off console by default", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logWarn, flushRollingLogsForTest } = await import("../lib/logger.js");

		logWarn("warning");
		await flushRollingLogsForTest();

		expect(warnSpy).not.toHaveBeenCalled();
		expect(fsMocks.appendFile).toHaveBeenCalledTimes(1);
		const [logPath, logLine, logEncoding] = fsMocks.appendFile.mock.calls[0];
		expect(logPath).toBe("/mock-home/.opencode/logs/codex-plugin/codex-plugin.log");
		expect(logEncoding).toBe("utf8");
		expect(logLine as string).toContain('"message":"warning"');
	});

	it("logWarn does not send warning toasts by default even when tui is available", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const showToast = vi.fn();
		const appLog = vi.fn().mockResolvedValue(undefined);
		const { configureLogger, logWarn, flushRollingLogsForTest } = await import("../lib/logger.js");

		const client = {
			app: { log: appLog },
			tui: { showToast },
		} as unknown as OpencodeClient;

		configureLogger({ client });

		logWarn("toast-warning");
		await flushRollingLogsForTest();

		expect(showToast).not.toHaveBeenCalled();
		expect(appLog).toHaveBeenCalledTimes(1);
		expect(warnSpy).not.toHaveBeenCalled();
		expect(fsMocks.appendFile).toHaveBeenCalledTimes(1);
	});

	it("logWarn sends warning toasts only when enabled via config", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const showToast = vi.fn();
		const appLog = vi.fn().mockResolvedValue(undefined);
		const { configureLogger, logWarn, flushRollingLogsForTest } = await import("../lib/logger.js");

		const client = {
			app: { log: appLog },
			tui: { showToast },
		} as unknown as OpencodeClient;

		configureLogger({ client, pluginConfig: { logging: { showWarningToasts: true } } });

		logWarn("toast-warning");
		await flushRollingLogsForTest();

		expect(showToast).toHaveBeenCalledWith({
			body: {
				title: "openhax/codex warning",
				message: "openhax/codex: toast-warning",
				variant: "warning",
			},
		});
		expect(appLog).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it("logWarn mirrors to console when enabled via config", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { configureLogger, logWarn, flushRollingLogsForTest } = await import("../lib/logger.js");

		configureLogger({ pluginConfig: { logging: { logWarningsToConsole: true } } });

		logWarn("console-warning");
		await flushRollingLogsForTest();

		expect(warnSpy).toHaveBeenCalledWith("[openhax/codex] console-warning");
		expect(fsMocks.appendFile).toHaveBeenCalled();
	});

	it("wraps long toast messages to avoid truncation", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const showToast = vi.fn();
		const appLog = vi.fn().mockResolvedValue(undefined);
		const { configureLogger, logWarn, flushRollingLogsForTest } = await import("../lib/logger.js");

		const client = {
			app: { log: appLog },
			tui: { showToast },
		} as unknown as OpencodeClient;

		configureLogger({ client, pluginConfig: { logging: { showWarningToasts: true } } });

		logWarn(
			"prefix mismatch detected while warming the session cache; reconnecting with fallback account boundaries",
		);
		await flushRollingLogsForTest();

		expect(showToast).toHaveBeenCalledTimes(1);
		const message = (showToast.mock.calls[0]?.[0] as { body: { message: string } }).body.message;
		const lines = message.split("\n");
		expect(lines.length).toBeGreaterThan(1);
		lines.forEach((line) => expect(line.length).toBeLessThanOrEqual(72));
		expect(appLog).not.toHaveBeenCalled();
		expect(warnSpy).not.toHaveBeenCalled();
	});
	it("logInfo does not mirror to console in tests, even with debug flag", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		fsMocks.existsSync.mockReturnValue(true);
		const { logInfo, flushRollingLogsForTest } = await import("../lib/logger.js");
		logInfo("info-message");
		await flushRollingLogsForTest();
		expect(logSpy).not.toHaveBeenCalled();

		process.env.DEBUG_CODEX_PLUGIN = "1";
		vi.resetModules();
		fsMocks.existsSync.mockReturnValue(true);
		const { logInfo: debugLogInfo, flushRollingLogsForTest: flushDebug } = await import("../lib/logger.js");
		debugLogInfo("info-message");
		await flushDebug();
		expect(logSpy).not.toHaveBeenCalled();
		// Disk logging still occurs when debug flag is set
		expect(fsMocks.appendFile).toHaveBeenCalled();
	});

	it("persist failures log warnings and still append entries", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		fsMocks.existsSync.mockReturnValue(true);
		fsMocks.writeFile.mockRejectedValue(new Error("boom"));
		const { logRequest, flushRollingLogsForTest } = await import("../lib/logger.js");

		logRequest("stage-two", { foo: "bar" });
		await flushRollingLogsForTest();

		expect(warnSpy).toHaveBeenCalledWith(
			'[openhax/codex] Failed to persist request log {"stage":"stage-two","error":"boom"}',
		);
		expect(fsMocks.appendFile).toHaveBeenCalled();
	});

	it("rotates logs when size exceeds limit", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		process.env.CODEX_LOG_MAX_BYTES = "10";
		process.env.CODEX_LOG_MAX_FILES = "2";
		fsMocks.existsSync.mockReturnValue(true);
		fsMocks.stat.mockResolvedValue({ size: 9 });
		const { logDebug, flushRollingLogsForTest } = await import("../lib/logger.js");

		logDebug("trigger-rotation");
		await flushRollingLogsForTest();

		expect(fsMocks.rm).toHaveBeenCalledWith("/mock-home/.opencode/logs/codex-plugin/codex-plugin.log.2", {
			force: true,
		});
		expect(fsMocks.rename).toHaveBeenCalledWith(
			"/mock-home/.opencode/logs/codex-plugin/codex-plugin.log",
			"/mock-home/.opencode/logs/codex-plugin/codex-plugin.log.1",
		);
		expect(fsMocks.appendFile).toHaveBeenCalled();
	});

	it("drops oldest buffered logs when queue overflows", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		process.env.CODEX_LOG_QUEUE_MAX = "2";
		fsMocks.existsSync.mockReturnValue(true);
		const { logDebug, flushRollingLogsForTest } = await import("../lib/logger.js");

		logDebug("first");
		logDebug("second");
		logDebug("third");
		await flushRollingLogsForTest();

		expect(fsMocks.appendFile).toHaveBeenCalledTimes(1);
		const appended = fsMocks.appendFile.mock.calls[0][1] as string;
		expect(appended).toContain('"message":"second"');
		expect(appended).toContain('"message":"third"');
		expect(appended).not.toContain('"message":"first"');
		expect(warnSpy).toHaveBeenCalledWith(
			'[openhax/codex] Rolling log queue overflow; dropping oldest entries {"maxQueueLength":2}',
		);
	});
});
