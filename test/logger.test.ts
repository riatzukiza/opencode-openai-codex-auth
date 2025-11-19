import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMocks = {
	writeFileSync: vi.fn(),
	appendFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	existsSync: vi.fn(),
};

vi.mock('node:fs', () => ({
	writeFileSync: fsMocks.writeFileSync,
	appendFileSync: fsMocks.appendFileSync,
	mkdirSync: fsMocks.mkdirSync,
	existsSync: fsMocks.existsSync,
}));

vi.mock('node:os', () => ({
	__esModule: true,
	homedir: () => '/mock-home',
}));

const originalEnv = { ...process.env };
const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
	vi.resetModules();
	Object.assign(process.env, originalEnv);
	delete process.env.ENABLE_PLUGIN_REQUEST_LOGGING;
	delete process.env.DEBUG_CODEX_PLUGIN;
	fsMocks.writeFileSync.mockReset();
	fsMocks.appendFileSync.mockReset();
	fsMocks.mkdirSync.mockReset();
	fsMocks.existsSync.mockReset();
	logSpy.mockClear();
	warnSpy.mockClear();
});

describe('logger', () => {
	it('LOGGING_ENABLED reflects env state', async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = '1';
		const { LOGGING_ENABLED } = await import('../lib/logger.js');
		expect(LOGGING_ENABLED).toBe(true);
	});

	it('logRequest writes stage file and rolling log by default', async () => {
		fsMocks.existsSync.mockReturnValue(false);
		const { logRequest } = await import('../lib/logger.js');

		logRequest('stage-one', { foo: 'bar' });

		expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/mock-home/.opencode/logs/codex-plugin', { recursive: true });
		const [requestPath, payload, encoding] = fsMocks.writeFileSync.mock.calls[0];
		expect(requestPath).toBe('/mock-home/.opencode/logs/codex-plugin/request-1-stage-one.json');
		expect(encoding).toBe('utf8');
		const parsedPayload = JSON.parse(payload as string);
		expect(parsedPayload.stage).toBe('stage-one');
		expect(parsedPayload.foo).toBe('bar');

		const [logPath, logLine, logEncoding] = fsMocks.appendFileSync.mock.calls[0];
		expect(logPath).toBe('/mock-home/.opencode/logs/codex-plugin/codex-plugin.log');
		expect(logEncoding).toBe('utf8');
		expect(logLine as string).toContain('"stage":"stage-one"');
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('logDebug appends to rolling log without printing to console by default', async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logDebug } = await import('../lib/logger.js');

		logDebug('debug-message', { detail: 'info' });

		expect(fsMocks.appendFileSync).toHaveBeenCalledTimes(1);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('logWarn emits to console even without env overrides', async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logWarn } = await import('../lib/logger.js');

		logWarn('warning');

		expect(warnSpy).toHaveBeenCalledWith('[openai-codex-plugin] warning');
	});

	it('logInfo only mirrors to console when logging env is enabled', async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logInfo } = await import('../lib/logger.js');
		logInfo('info-message');
		expect(logSpy).not.toHaveBeenCalled();

		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = '1';
		await vi.resetModules();
		fsMocks.existsSync.mockReturnValue(true);
		const { logInfo: envLogInfo } = await import('../lib/logger.js');
		envLogInfo('info-message');
		expect(logSpy).toHaveBeenCalledWith('[openai-codex-plugin] info-message');
	});

	it('persist failures log warnings and append entries', async () => {
		fsMocks.existsSync.mockReturnValue(true);
		fsMocks.writeFileSync.mockImplementation(() => {
			throw new Error('boom');
		});
		const { logRequest } = await import('../lib/logger.js');

		logRequest('stage-two', { foo: 'bar' });

		expect(warnSpy).toHaveBeenCalledWith('[openai-codex-plugin] Failed to persist request log {"stage":"stage-two","error":"boom"}');
		expect(fsMocks.appendFileSync).toHaveBeenCalled();
	});
});
