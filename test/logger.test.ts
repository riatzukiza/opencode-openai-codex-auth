import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fsMocks = vi.hoisted(() => ({
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	existsSync: vi.fn(),
}));

const homedirMock = vi.hoisted(() => vi.fn(() => '/mock-home'));

vi.mock('node:fs', () => ({
	__esModule: true,
	writeFileSync: fsMocks.writeFileSync,
	mkdirSync: fsMocks.mkdirSync,
	existsSync: fsMocks.existsSync,
}));

vi.mock('node:os', () => ({
	__esModule: true,
	homedir: homedirMock,
}));

describe('Logger Module', () => {
	const originalEnv = { ...process.env };
	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		Object.assign(process.env, originalEnv);
		delete process.env.ENABLE_PLUGIN_REQUEST_LOGGING;
		delete process.env.DEBUG_CODEX_PLUGIN;
		fsMocks.writeFileSync.mockReset();
		fsMocks.mkdirSync.mockReset();
		fsMocks.existsSync.mockReset();
		homedirMock.mockReturnValue('/mock-home');
		logSpy.mockClear();
		warnSpy.mockClear();
		errorSpy.mockClear();
	});

	afterEach(() => {
		Object.assign(process.env, originalEnv);
	});

	it('LOGGING_ENABLED reflects env state', async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = '1';
		const { LOGGING_ENABLED } = await import('../lib/logger.js');
		expect(LOGGING_ENABLED).toBe(true);
	});

	it('logRequest skips writing when logging disabled', async () => {
		fsMocks.existsSync.mockReturnValue(true);
		const { logRequest } = await import('../lib/logger.js');
		logRequest('stage-one', { foo: 'bar' });
		expect(fsMocks.writeFileSync).not.toHaveBeenCalled();
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('logRequest creates directory and writes when enabled', async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = '1';
		let existsCall = 0;
		fsMocks.existsSync.mockImplementation(() => existsCall++ > 0);
		const { logRequest } = await import('../lib/logger.js');

		logRequest('before', { some: 'data' });

		expect(fsMocks.mkdirSync).toHaveBeenCalledWith('/mock-home/.opencode/logs/codex-plugin', { recursive: true });
		expect(fsMocks.writeFileSync).toHaveBeenCalledOnce();

		const [, jsonString] = fsMocks.writeFileSync.mock.calls[0];
		const parsed = JSON.parse(jsonString as string);
		expect(parsed.stage).toBe('before');
		expect(parsed.some).toBe('data');
		expect(typeof parsed.requestId).toBe('number');
	});

	it('logRequest records errors from writeFileSync', async () => {
		process.env.ENABLE_PLUGIN_REQUEST_LOGGING = '1';
		fsMocks.existsSync.mockReturnValue(true);
		fsMocks.writeFileSync.mockImplementation(() => {
			throw new Error('boom');
		});
		const { logRequest } = await import('../lib/logger.js');

		logRequest('error-stage', { boom: true });

		expect(errorSpy).toHaveBeenCalledWith('[openai-codex-plugin] Failed to write log:', 'boom');
	});

	it('logDebug logs only when enabled', async () => {
		const { logDebug } = await import('../lib/logger.js');
		logDebug('should not log');
		expect(logSpy).not.toHaveBeenCalled();

		process.env.DEBUG_CODEX_PLUGIN = '1';
		vi.resetModules();
		const { logDebug: reloaded } = await import('../lib/logger.js');
		reloaded('debug message', { value: 42 });
		expect(logSpy).toHaveBeenCalledWith('[openai-codex-plugin] debug message', { value: 42 });
	});

	it('logWarn always logs', async () => {
		const { logWarn } = await import('../lib/logger.js');
		logWarn('warning', { detail: 'info' });
		expect(warnSpy).toHaveBeenCalledWith('[openai-codex-plugin] warning', { detail: 'info' });
	});
});
