import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const fetchMock = vi.fn();
const decodeJWTMock = vi.fn(() => ({
	['https://api.openai.com/auth']: { chatgpt_account_id: 'acc-123' },
}));
const shouldRefreshTokenMock = vi.fn(() => false);
const refreshAndUpdateTokenMock = vi.fn();
const extractRequestUrlMock = vi.fn((input: string | URL | Request) =>
	typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
);
const rewriteUrlForCodexMock = vi.fn(() => 'https://codex/responses');
const transformRequestForCodexMock = vi.fn();
const createCodexHeadersMock = vi.fn(() => new Headers({ Authorization: 'Bearer token' }));
const handleErrorResponseMock = vi.fn();
const handleSuccessResponseMock = vi.fn();
const logRequestMock = vi.hoisted(() => vi.fn());
const logDebugMock = vi.hoisted(() => vi.fn());
const loadPluginConfigMock = vi.hoisted(() => vi.fn(() => ({ enablePromptCaching: true })));
const getCodexModeMock = vi.hoisted(() => vi.fn(() => true));
const getCodexInstructionsMock = vi.hoisted(() => vi.fn(() => Promise.resolve('instructions')));

const sessionManagerInstance = vi.hoisted(() => ({
	getContext: vi.fn(() => ({ sessionId: 'session-1', preserveIds: true, enabled: true })),
	applyRequest: vi.fn((_body, ctx) => ({ ...ctx, applied: true })),
	recordResponse: vi.fn(),
}));

const SessionManagerMock = vi.hoisted(() => vi.fn(() => sessionManagerInstance));

vi.mock('../lib/auth/auth.js', async () => {
	const actual = await vi.importActual<typeof import('../lib/auth/auth.js')>('../lib/auth/auth.js');
	return {
		...actual,
		decodeJWT: decodeJWTMock,
		createAuthorizationFlow: vi.fn(),
		exchangeAuthorizationCode: vi.fn(),
	};
});

vi.mock('../lib/prompts/codex.js', () => ({
	__esModule: true,
	getCodexInstructions: getCodexInstructionsMock,
}));

vi.mock('../lib/logger.js', () => ({
	__esModule: true,
	logRequest: logRequestMock,
	logDebug: logDebugMock,
}));

vi.mock('../lib/request/fetch-helpers.js', () => ({
	__esModule: true,
	shouldRefreshToken: shouldRefreshTokenMock,
	refreshAndUpdateToken: refreshAndUpdateTokenMock,
	extractRequestUrl: extractRequestUrlMock,
	rewriteUrlForCodex: rewriteUrlForCodexMock,
	transformRequestForCodex: transformRequestForCodexMock,
	createCodexHeaders: createCodexHeadersMock,
	handleErrorResponse: handleErrorResponseMock,
	handleSuccessResponse: handleSuccessResponseMock,
}));

vi.mock('../lib/config.js', () => ({
	__esModule: true,
	loadPluginConfig: loadPluginConfigMock,
	getCodexMode: getCodexModeMock,
}));

vi.mock('../lib/session/session-manager.js', () => ({
	__esModule: true,
	SessionManager: SessionManagerMock,
}));

vi.mock('../lib/auth/server.js', () => ({
	__esModule: true,
	startLocalOAuthServer: vi.fn(),
}));

vi.mock('../lib/auth/browser.js', () => ({
	__esModule: true,
	openBrowserUrl: vi.fn(),
}));

describe('OpenAIAuthPlugin', () => {
	beforeEach(() => {
		vi.resetModules();
		fetchMock.mockReset();
		sessionManagerInstance.getContext.mockClear();
		sessionManagerInstance.applyRequest.mockClear();
		sessionManagerInstance.recordResponse.mockClear();
		transformRequestForCodexMock.mockReset();
		createCodexHeadersMock.mockReset();
		handleSuccessResponseMock.mockReset();
		handleErrorResponseMock.mockReset();
		logRequestMock.mockClear();
		logDebugMock.mockClear();
		shouldRefreshTokenMock.mockReturnValue(false);
		refreshAndUpdateTokenMock.mockReset();
		decodeJWTMock.mockClear();
		getCodexInstructionsMock.mockClear();
		SessionManagerMock.mockClear();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns empty loader result for non-oauth auth types', async () => {
		const { OpenAIAuthPlugin } = await import('../index.js');
		const plugin = await OpenAIAuthPlugin({ client: { auth: { set: vi.fn() } } } as never);
		const result = await plugin.auth.loader(async () => ({ type: 'api', key: '123' } as const), {});
		expect(result).toEqual({});
	});

	it('configures fetch for OAuth flow and processes responses', async () => {
		const { OpenAIAuthPlugin } = await import('../index.js');
		sessionManagerInstance.applyRequest.mockReturnValue({
			sessionId: 'session-1',
			enabled: true,
			applied: true,
		});
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: 'gpt-5', tools: undefined },
			updatedInit: { body: JSON.stringify({ model: 'gpt-5' }) },
			sessionContext: { sessionId: 'session-1', enabled: true, applied: true },
		});
		handleSuccessResponseMock.mockResolvedValue(
			new Response(JSON.stringify({ id: 'resp-1' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}),
		);
		fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

		const getAuth = vi
			.fn<[], Promise<{ type: 'oauth'; access: string; refresh: string; expires: number }>>()
			.mockResolvedValue({
				type: 'oauth',
				access: 'access-token',
				refresh: 'refresh-token',
				expires: Date.now() + 10000,
			});

		const client = { auth: { set: vi.fn() } };
		const plugin = await OpenAIAuthPlugin({ client } as never);
		const config = await plugin.auth.loader(getAuth, { options: { a: 1 } });
		expect(config?.apiKey).toBeDefined();
		expect(config?.baseURL).toContain('https://');

		await config.fetch('https://chatgpt.com/backend-api/responses', {
			body: JSON.stringify({ model: 'gpt-5' }),
			headers: { 'x-api-key': 'remove-me' },
		});

		expect(shouldRefreshTokenMock).toHaveBeenCalled();
		expect(extractRequestUrlMock).toHaveBeenCalledWith('https://chatgpt.com/backend-api/responses');
		expect(rewriteUrlForCodexMock).toHaveBeenCalled();
		expect(transformRequestForCodexMock).toHaveBeenCalled();
		expect(createCodexHeadersMock).toHaveBeenCalledWith(expect.anything(), 'acc-123', 'access-token');
		expect(fetchMock).toHaveBeenCalledWith('https://codex/responses', expect.objectContaining({ headers: expect.any(Headers) }));
		expect(handleSuccessResponseMock).toHaveBeenCalled();
	});
});
