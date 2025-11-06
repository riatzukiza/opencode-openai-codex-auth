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

vi.mock('../lib/auth/auth.js', () => ({
	__esModule: true,
	refreshAccessToken: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
	__esModule: true,
	logRequest: vi.fn(),
	logDebug: vi.fn(),
}));

vi.mock('../lib/request/request-transformer.js', () => ({
	__esModule: true,
	transformRequestBody: vi.fn(),
}));

vi.mock('../lib/request/response-handler.js', () => ({
	__esModule: true,
	convertSseToJson: vi.fn(),
	ensureContentType: vi.fn((headers: Headers) => headers),
}));

// Get mocked functions after import
const { refreshAccessToken } = await import('../lib/auth/auth.js');
const { logRequest, logDebug } = await import('../lib/logger.js');
const { transformRequestBody } = await import('../lib/request/request-transformer.js');
const { convertSseToJson, ensureContentType } = await import('../lib/request/response-handler.js');

const refreshAccessTokenMock = vi.mocked(refreshAccessToken);
const logRequestMock = vi.mocked(logRequest);
const logDebugMock = vi.mocked(logDebug);
const transformRequestBodyMock = vi.mocked(transformRequestBody);
const convertSseToJsonMock = vi.mocked(convertSseToJson);
const ensureContentTypeMock = vi.mocked(ensureContentType);

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

		it('should create headers with all required fields when cache key provided', () => {
	    const headers = createCodexHeaders(undefined, accountId, accessToken, { model: 'gpt-5-codex', promptCacheKey: 'session-1' });

			expect(headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
			expect(headers.get(OPENAI_HEADERS.ACCOUNT_ID)).toBe(accountId);
			expect(headers.get(OPENAI_HEADERS.BETA)).toBe(OPENAI_HEADER_VALUES.BETA_RESPONSES);
			expect(headers.get(OPENAI_HEADERS.ORIGINATOR)).toBe(OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBe('session-1');
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBe('session-1');
			expect(headers.get('accept')).toBe('text/event-stream');
		});

		it('enriches usage limit errors with friendly message and rate limits', async () => {
			const body = {
				error: {
					code: 'usage_limit_reached',
					message: 'limit reached',
					plan_type: 'pro',
				},
			};
			const headers = new Headers({
				'x-codex-primary-used-percent': '75',
				'x-codex-primary-window-minutes': '300',
				'x-codex-primary-reset-at': String(Math.floor(Date.now() / 1000) + 1800),
			});
			const resp = new Response(JSON.stringify(body), { status: 429, headers });
			const enriched = await handleErrorResponse(resp);
			expect(enriched.status).toBe(429);
			const json = await enriched.json() as any;
			expect(json.error).toBeTruthy();
			expect(json.error.friendly_message).toMatch(/usage limit/i);
			expect(json.error.rate_limits.primary.used_percent).toBe(75);
			expect(json.error.rate_limits.primary.window_minutes).toBe(300);
			expect(typeof json.error.rate_limits.primary.resets_at).toBe('number');
		});

		it('should remove x-api-key header', () => {
        const init = { headers: { 'x-api-key': 'should-be-removed' } } as any;
        const headers = createCodexHeaders(init, accountId, accessToken, { model: 'gpt-5', promptCacheKey: 'session-2' });

			expect(headers.has('x-api-key')).toBe(false);
		});

		it('should preserve other existing headers', () => {
        const init = { headers: { 'Content-Type': 'application/json' } } as any;
        const headers = createCodexHeaders(init, accountId, accessToken, { model: 'gpt-5', promptCacheKey: 'session-3' });

			expect(headers.get('Content-Type')).toBe('application/json');
		});

		it('should use provided promptCacheKey for both conversation_id and session_id', () => {
			const key = 'ses_abc123';
			const headers = createCodexHeaders(undefined, accountId, accessToken, { promptCacheKey: key });
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBe(key);
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBe(key);
		});

		it('does not set conversation/session headers when no promptCacheKey provided', () => {
			const headers = createCodexHeaders(undefined, accountId, accessToken, { model: 'gpt-5' });
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBeNull();
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBeNull();
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
			if (!result.success) {
				expect((await result.response.clone().json()).error).toBe('Token refresh failed');
			}
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
			const body = { model: 'gpt-5', tools: [], input: [{ type: 'message', role: 'user', content: 'hello' }] };
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
				{ preserveIds: true },
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
