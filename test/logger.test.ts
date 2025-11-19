import { describe, it, expect, vi, beforeEach } from "vitest";

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
const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
	logSpy.mockClear();
	warnSpy.mockClear();
	errorSpy.mockClear();
});

describe("logger", () => {
	it("LOGGING_ENABLED reflects env state", async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		const { LOGGING_ENABLED } = await import("../lib/logger.js");
		expect(LOGGING_ENABLED).toBe(true);
	});

	it("logRequest writes stage file and rolling log by default", async () => {
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

	it("logDebug appends to rolling log without printing to console by default", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logDebug, flushRollingLogsForTest } = await import("../lib/logger.js");

		logDebug("debug-message", { detail: "info" });
		await flushRollingLogsForTest();

		expect(fsMocks.appendFile).toHaveBeenCalledTimes(1);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("logWarn emits to console even without env overrides", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logWarn, flushRollingLogsForTest } = await import("../lib/logger.js");

		logWarn("warning");
		await flushRollingLogsForTest();

		expect(warnSpy).toHaveBeenCalledWith("[openhax/codex] warning");
	});

	it("logInfo does not mirror to console unless debug flag is set", async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logInfo, flushRollingLogsForTest } = await import("../lib/logger.js");
		logInfo("info-message");
		await flushRollingLogsForTest();
		expect(logSpy).not.toHaveBeenCalled();

		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = "1";
		vi.resetModules();
		fsMocks.existsSync.mockReturnValue(true);
		const { logInfo: envLogInfo, flushRollingLogsForTest: flushEnabled } = await import("../lib/logger.js");
		envLogInfo("info-message");
		await flushEnabled();
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("persist failures log warnings and still append entries", async () => {
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
