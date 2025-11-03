import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	shouldRefreshToken,
	extractRequestUrl,
	rewriteUrlForCodex,
	createCodexHeaders,
	refreshAndUpdateToken,
	transformRequestForCodex,
	handleErrorResponse,
	handleSuccessResponse,
} from '../lib/request/fetch-helpers.js';
import type { Auth, SessionContext } from '../lib/types.js';
import { URL_PATHS, OPENAI_HEADERS, OPENAI_HEADER_VALUES } from '../lib/constants.js';

const refreshAccessTokenMock = vi.hoisted(() => vi.fn());
const logRequestMock = vi.hoisted(() => vi.fn());
const logDebugMock = vi.hoisted(() => vi.fn());
const transformRequestBodyMock = vi.hoisted(() => vi.fn());
const convertSseToJsonMock = vi.hoisted(() => vi.fn());
const ensureContentTypeMock = vi.hoisted(() => vi.fn((headers: Headers) => headers));

vi.mock('../lib/auth/auth.js', async () => {
	const actual = await vi.importActual<typeof import('../lib/auth/auth.js')>('../lib/auth/auth.js');
	return {
		...actual,
		refreshAccessToken: refreshAccessTokenMock,
	};
});

vi.mock('../lib/logger.js', () => ({
	__esModule: true,
	logRequest: logRequestMock,
	logDebug: logDebugMock,
}));

vi.mock('../lib/request/request-transformer.js', () => ({
	__esModule: true,
	transformRequestBody: transformRequestBodyMock,
}));

vi.mock('../lib/request/response-handler.js', () => ({
	__esModule: true,
	convertSseToJson: convertSseToJsonMock,
	ensureContentType: ensureContentTypeMock,
}));

const originalConsoleError = console.error;

beforeEach(() => {
	vi.clearAllMocks();
	convertSseToJsonMock.mockReset();
	ensureContentTypeMock.mockImplementation((headers: Headers) => headers);
	console.error = vi.fn();
});

afterEach(() => {
	console.error = originalConsoleError;
});

describe('Fetch Helpers Module', () => {
	describe('shouldRefreshToken', () => {
		it('should return true for non-oauth auth', () => {
			const auth: Auth = { type: 'api', key: 'test-key' };
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it('should return true when access token is missing', () => {
			const auth: Auth = { type: 'oauth', access: '', refresh: 'refresh-token', expires: Date.now() + 1000 };
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it('should return true when token is expired', () => {
			const auth: Auth = {
				type: 'oauth',
				access: 'access-token',
				refresh: 'refresh-token',
				expires: Date.now() - 1000 // expired
			};
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it('should return false for valid oauth token', () => {
			const auth: Auth = {
				type: 'oauth',
				access: 'access-token',
				refresh: 'refresh-token',
				expires: Date.now() + 10000 // valid for 10 seconds
			};
			expect(shouldRefreshToken(auth)).toBe(false);
		});
	});

	describe('extractRequestUrl', () => {
		it('should extract URL from string', () => {
			const url = 'https://example.com/test';
			expect(extractRequestUrl(url)).toBe(url);
		});

		it('should extract URL from URL object', () => {
			const url = new URL('https://example.com/test');
			expect(extractRequestUrl(url)).toBe('https://example.com/test');
		});

		it('should extract URL from Request object', () => {
			const request = new Request('https://example.com/test');
			expect(extractRequestUrl(request)).toBe('https://example.com/test');
		});
	});

	describe('rewriteUrlForCodex', () => {
		it('should rewrite /responses to /codex/responses', () => {
			const url = 'https://chatgpt.com/backend-api/responses';
			expect(rewriteUrlForCodex(url)).toBe('https://chatgpt.com/backend-api/codex/responses');
		});

		it('should not modify URL without /responses', () => {
			const url = 'https://chatgpt.com/backend-api/other';
			expect(rewriteUrlForCodex(url)).toBe(url);
		});

		it('should only replace first occurrence', () => {
			const url = 'https://example.com/responses/responses';
			const result = rewriteUrlForCodex(url);
			expect(result).toBe('https://example.com/codex/responses/responses');
		});
	});

	describe('createCodexHeaders', () => {
		const accountId = 'test-account-123';
		const accessToken = 'test-access-token';

		it('should create headers with all required fields', () => {
			const headers = createCodexHeaders(undefined, accountId, accessToken);

			expect(headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
			expect(headers.get(OPENAI_HEADERS.ACCOUNT_ID)).toBe(accountId);
			expect(headers.get(OPENAI_HEADERS.BETA)).toBe(OPENAI_HEADER_VALUES.BETA_RESPONSES);
			expect(headers.get(OPENAI_HEADERS.ORIGINATOR)).toBe(OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);
			expect(headers.has(OPENAI_HEADERS.SESSION_ID)).toBe(true);
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBe(
				headers.get(OPENAI_HEADERS.CONVERSATION_ID),
			);
		});

		it('should remove x-api-key header', () => {
			const init = { headers: { 'x-api-key': 'should-be-removed' } };
			const headers = createCodexHeaders(init, accountId, accessToken);

			expect(headers.has('x-api-key')).toBe(false);
		});

		it('should preserve other existing headers', () => {
			const init = { headers: { 'Content-Type': 'application/json' } };
			const headers = createCodexHeaders(init, accountId, accessToken);

			expect(headers.get('Content-Type')).toBe('application/json');
		});

		it('should generate unique session IDs', () => {
			const headers1 = createCodexHeaders(undefined, accountId, accessToken);
			const headers2 = createCodexHeaders(undefined, accountId, accessToken);

			expect(headers1.get(OPENAI_HEADERS.SESSION_ID)).not.toBe(
				headers2.get(OPENAI_HEADERS.SESSION_ID)
			);
		});

		it('should validate session ID format (UUID)', () => {
			const headers = createCodexHeaders(undefined, accountId, accessToken);
			const sessionId = headers.get(OPENAI_HEADERS.SESSION_ID);

			// UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
			expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		});

		it('should use session context ID for session and conversation headers', () => {
			const sessionId = 'conversation-123';
			const sessionContext: SessionContext = {
				sessionId,
				enabled: true,
				preserveIds: true,
				isNew: false,
				state: {
					id: sessionId,
					promptCacheKey: 'cache-key',
					store: false,
					lastInput: [],
					lastPrefixHash: null,
					lastUpdated: Date.now(),
				},
			};

			const headers = createCodexHeaders(undefined, accountId, accessToken, sessionContext);

			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBe(sessionId);
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBe(sessionId);
		});
	});

	describe('refreshAndUpdateToken', () => {
		it('returns failure response when refresh fails', async () => {
			refreshAccessTokenMock.mockResolvedValue({ type: 'failed' });

			const client = {
				auth: {
					set: vi.fn(),
				},
			} as unknown as { auth: { set: () => Promise<void> } };

			const auth: Auth = {
				type: 'oauth',
				access: 'token',
				refresh: 'refresh',
				expires: Date.now() - 1000,
			};

			const result = await refreshAndUpdateToken(auth, client as never);
			expect(result.success).toBe(false);
			expect((await result.response.clone().json()).error).toBe('Token refresh failed');
		expect(console.error).toHaveBeenCalledWith(
			'[openai-codex-plugin] Failed to refresh token, authentication required',
		);
			expect(client.auth.set).not.toHaveBeenCalled();
		});

		it('updates stored credentials on success', async () => {
			const newAuth = {
				type: 'success' as const,
				access: 'new-access',
				refresh: 'new-refresh',
				expires: Date.now() + 1000,
			};
			refreshAccessTokenMock.mockResolvedValue(newAuth);
			const setMock = vi.fn();
			const client = { auth: { set: setMock } };
			const auth: Auth = {
				type: 'oauth',
				access: 'old-access',
				refresh: 'old-refresh',
				expires: Date.now(),
			};

			const result = await refreshAndUpdateToken(auth, client as never);
			expect(result.success).toBe(true);
			expect(auth.access).toBe('new-access');
			expect(auth.refresh).toBe('new-refresh');
			expect(auth.expires).toBe(newAuth.expires);
			expect(setMock).toHaveBeenCalledWith({
				path: { id: 'openai' },
				body: {
					type: 'oauth',
					access: 'new-access',
					refresh: 'new-refresh',
					expires: newAuth.expires,
				},
			});
		});
	});

	describe('transformRequestForCodex', () => {
		it('returns undefined when no body provided', async () => {
			const result = await transformRequestForCodex(undefined, 'url', 'instructions', { global: {}, models: {} });
			expect(result).toBeUndefined();
			expect(transformRequestBodyMock).not.toHaveBeenCalled();
		});

		it('handles invalid JSON payload gracefully', async () => {
			const init: RequestInit = { body: 'not-json' };
			const result = await transformRequestForCodex(init, 'url', 'instructions', { global: {}, models: {} });
			expect(result).toBeUndefined();
			expect(console.error).toHaveBeenCalledWith('[openai-codex-plugin] Error parsing request:', expect.anything());
		});

		it('transforms request body and returns updated init', async () => {
			const body = { model: 'gpt-5', tools: [], input: ['hello'] };
			const transformed = { ...body, model: 'gpt-5-codex', include: ['reasoning.encrypted_content'] };
			transformRequestBodyMock.mockResolvedValue(transformed);
			const sessionContext = { sessionId: 'session-1', preserveIds: true, enabled: true };
			const appliedContext = { ...sessionContext, isNew: false };
			const sessionManager = {
				getContext: vi.fn().mockReturnValue(sessionContext),
				applyRequest: vi.fn().mockReturnValue(appliedContext),
			};

			const result = await transformRequestForCodex(
				{ body: JSON.stringify(body) },
				'https://chatgpt.com/backend-api/codex/responses',
				'instructions',
				{ global: {}, models: {} },
				true,
				sessionManager as never,
			);

			expect(transformRequestBodyMock).toHaveBeenCalledWith(
				body,
				'instructions',
				{ global: {}, models: {} },
				true,
				{ preserveIds: false },
			);
			expect(result?.body).toEqual(transformed);
			expect(result?.updatedInit.body).toBe(JSON.stringify(transformed));
		});
	});

	describe('response handlers', () => {
		it('handleErrorResponse logs and replays response content', async () => {
			const response = new Response('failure', {
				status: 418,
				statusText: "I'm a teapot",
				headers: { 'content-type': 'text/plain' },
			});

			const result = await handleErrorResponse(response);
			expect(result.status).toBe(418);
			expect(await result.text()).toBe('failure');
			expect(console.error).toHaveBeenCalledWith('[openai-codex-plugin] 418 error:', 'failure');
		});

		it('handleSuccessResponse converts SSE when no tools', async () => {
			const response = new Response('stream');
			const converted = new Response('converted');
			ensureContentTypeMock.mockImplementation(() => new Headers({ 'content-type': 'text/plain' }));
			convertSseToJsonMock.mockResolvedValue(converted);

			const result = await handleSuccessResponse(response, false);
			expect(ensureContentTypeMock).toHaveBeenCalled();
			expect(convertSseToJsonMock).toHaveBeenCalled();
			expect(result).toBe(converted);
		});

		it('handleSuccessResponse returns streaming response when tools present', async () => {
			const response = new Response('stream-body', {
				status: 200,
				statusText: 'OK',
				headers: { 'content-type': 'text/event-stream' },
			});
			const headers = new Headers({ 'content-type': 'text/event-stream' });
			ensureContentTypeMock.mockReturnValue(headers);

			const result = await handleSuccessResponse(response, true);
			expect(result.status).toBe(200);
			expect(result.headers.get('content-type')).toBe('text/event-stream');
			expect(convertSseToJsonMock).not.toHaveBeenCalled();
		});
	});
});
