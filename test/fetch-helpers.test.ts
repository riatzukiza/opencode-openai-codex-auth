import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPENAI_HEADER_VALUES, OPENAI_HEADERS } from "../lib/constants.js";
import {
	createCodexHeaders,
	extractRequestUrl,
	handleErrorResponse,
	handleSuccessResponse,
	refreshAndUpdateToken,
	rewriteUrlForCodex,
	shouldRefreshToken,
	transformRequestForCodex,
} from "../lib/request/fetch-helpers.js";
import type { Auth } from "../lib/types.js";

vi.mock("../lib/auth/auth.js", () => ({
	__esModule: true,
	refreshAccessToken: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
	__esModule: true,
	logRequest: vi.fn(),
	logDebug: vi.fn(),
	logError: vi.fn((message: string, data?: any) => {
		console.error(message, data || "");
	}),
}));

vi.mock("../lib/request/request-transformer.js", () => ({
	__esModule: true,
	transformRequestBody: vi.fn(),
}));

vi.mock("../lib/request/response-handler.js", () => ({
	__esModule: true,
	convertSseToJson: vi.fn(),
	ensureContentType: vi.fn((headers: Headers) => headers),
}));

// Get mocked functions after import
const { refreshAccessToken } = await import("../lib/auth/auth.js");
const { logRequest, logDebug, logError } = await import("../lib/logger.js");
const { transformRequestBody } = await import("../lib/request/request-transformer.js");
const { convertSseToJson, ensureContentType } = await import("../lib/request/response-handler.js");

const refreshAccessTokenMock = vi.mocked(refreshAccessToken);
const _logRequestMock = vi.mocked(logRequest);
const _logDebugMock = vi.mocked(logDebug);
const logErrorMock = vi.mocked(logError);
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

describe("Fetch Helpers Module", () => {
	describe("shouldRefreshToken", () => {
		it("should return true for non-oauth auth", () => {
			const auth: Auth = { type: "api", key: "test-key" };
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it("should return true when access token is missing", () => {
			const auth: Auth = {
				type: "oauth",
				access: "",
				refresh: "refresh-token",
				expires: Date.now() + 1000,
			};
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it("should return true when token is expired", () => {
			const auth: Auth = {
				type: "oauth",
				access: "access-token",
				refresh: "refresh-token",
				expires: Date.now() - 1000, // expired
			};
			expect(shouldRefreshToken(auth)).toBe(true);
		});

		it("should return false for valid oauth token", () => {
			const auth: Auth = {
				type: "oauth",
				access: "access-token",
				refresh: "refresh-token",
				expires: Date.now() + 10000, // valid for 10 seconds
			};
			expect(shouldRefreshToken(auth)).toBe(false);
		});
	});

	describe("extractRequestUrl", () => {
		it("should extract URL from string", () => {
			const url = "https://example.com/test";
			expect(extractRequestUrl(url)).toBe(url);
		});

		it("should extract URL from URL object", () => {
			const url = new URL("https://example.com/test");
			expect(extractRequestUrl(url)).toBe("https://example.com/test");
		});

		it("should extract URL from Request object", () => {
			const request = new Request("https://example.com/test");
			expect(extractRequestUrl(request)).toBe("https://example.com/test");
		});
	});

	describe("rewriteUrlForCodex", () => {
		it("should rewrite /responses to /codex/responses", () => {
			const url = "https://chatgpt.com/backend-api/responses";
			expect(rewriteUrlForCodex(url)).toBe("https://chatgpt.com/backend-api/codex/responses");
		});

		it("should not modify URL without /responses", () => {
			const url = "https://chatgpt.com/backend-api/other";
			expect(rewriteUrlForCodex(url)).toBe(url);
		});

		it("should only replace first occurrence", () => {
			const url = "https://example.com/responses/responses";
			const result = rewriteUrlForCodex(url);
			expect(result).toBe("https://example.com/codex/responses/responses");
		});
	});

	describe("createCodexHeaders", () => {
		const accountId = "test-account-123";
		const accessToken = "test-access-token";

		it("should create headers with all required fields when cache key provided", () => {
			const headers = createCodexHeaders(undefined, accountId, accessToken, {
				model: "gpt-5-codex",
				promptCacheKey: "session-1",
			});

			expect(headers.get("Authorization")).toBe(`Bearer ${accessToken}`);
			expect(headers.get(OPENAI_HEADERS.ACCOUNT_ID)).toBe(accountId);
			expect(headers.get(OPENAI_HEADERS.BETA)).toBe(OPENAI_HEADER_VALUES.BETA_RESPONSES);
			expect(headers.get(OPENAI_HEADERS.ORIGINATOR)).toBe(OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBe("session-1");
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBe("session-1");
			expect(headers.get("accept")).toBe("text/event-stream");
		});

		it("should remove x-api-key header", () => {
			const init = { headers: { "x-api-key": "should-be-removed" } } as any;
			const headers = createCodexHeaders(init, accountId, accessToken, {
				model: "gpt-5",
				promptCacheKey: "session-2",
			});

			expect(headers.has("x-api-key")).toBe(false);
		});

		it("should preserve other existing headers", () => {
			const init = { headers: { "Content-Type": "application/json" } } as any;
			const headers = createCodexHeaders(init, accountId, accessToken, {
				model: "gpt-5",
				promptCacheKey: "session-3",
			});

			expect(headers.get("Content-Type")).toBe("application/json");
		});

		it("should use provided promptCacheKey for both conversation_id and session_id", () => {
			const key = "ses_abc123";
			const headers = createCodexHeaders(undefined, accountId, accessToken, {
				promptCacheKey: key,
			});
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBe(key);
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBe(key);
		});

		it("does not set conversation/session headers when no promptCacheKey provided", () => {
			const headers = createCodexHeaders(undefined, accountId, accessToken, { model: "gpt-5" });
			expect(headers.get(OPENAI_HEADERS.CONVERSATION_ID)).toBeNull();
			expect(headers.get(OPENAI_HEADERS.SESSION_ID)).toBeNull();
		});
	});

	describe("refreshAndUpdateToken", () => {
		it("returns failure response when refresh fails", async () => {
			refreshAccessTokenMock.mockResolvedValue({ type: "failed" });

			const client = {
				auth: {
					set: vi.fn(),
				},
			} as unknown as { auth: { set: () => Promise<void> } };

			const auth: Auth = {
				type: "oauth",
				access: "token",
				refresh: "refresh",
				expires: Date.now() - 1000,
			};

			const result = await refreshAndUpdateToken(auth, client as never);
			expect(result.success).toBe(false);
			if (!result.success) {
				expect((await result.response.clone().json()).error).toBe("Token refresh failed");
			}
			expect(logErrorMock).toHaveBeenCalledWith("Failed to refresh token, authentication required");
			expect(client.auth.set).not.toHaveBeenCalled();
		});

		it("updates stored credentials on success", async () => {
			const newAuth = {
				type: "success" as const,
				access: "new-access",
				refresh: "new-refresh",
				expires: Date.now() + 1000,
			};
			refreshAccessTokenMock.mockResolvedValue(newAuth);
			const setMock = vi.fn();
			const client = { auth: { set: setMock } };
			const auth: Auth = {
				type: "oauth",
				access: "old-access",
				refresh: "old-refresh",
				expires: Date.now(),
			};

			const result = await refreshAndUpdateToken(auth, client as never);
			expect(result.success).toBe(true);
			if (result.success && result.auth.type === "oauth") {
				expect(result.auth.access).toBe("new-access");
				expect(result.auth.refresh).toBe("new-refresh");
				expect(result.auth.expires).toBe(newAuth.expires);
			}
			expect(setMock).toHaveBeenCalledWith({
				path: { id: "openai" },
				body: {
					type: "oauth",
					access: "new-access",
					refresh: "new-refresh",
					expires: newAuth.expires,
				},
			});
		});
	});

	describe("transformRequestForCodex", () => {
		it("returns undefined when no body provided", async () => {
			const result = await transformRequestForCodex(undefined, "url", "instructions", {
				global: {},
				models: {},
			});
			expect(result).toBeUndefined();
			expect(transformRequestBodyMock).not.toHaveBeenCalled();
		});

		it("handles invalid JSON payload gracefully", async () => {
			const init: RequestInit = { body: "not-json" };
			const result = await transformRequestForCodex(init, "url", "instructions", {
				global: {},
				models: {},
			});
			expect(result).toBeUndefined();
			expect(logErrorMock).toHaveBeenCalledWith("Error parsing request", {
				error: expect.any(String),
			});
		});

		it("transforms request body and returns updated init", async () => {
			const body = {
				model: "gpt-5",
				tools: [],
				input: [{ type: "message", role: "user", content: "hello" }],
			};
			const transformed = {
				...body,
				model: "gpt-5-codex",
				include: ["reasoning.encrypted_content"],
				input: body.input.map((item) => ({ ...item })),
			};
			transformRequestBodyMock.mockResolvedValue({ body: transformed });
			const sessionContext = { sessionId: "session-1", preserveIds: true, enabled: true };
			const appliedContext = { ...sessionContext, isNew: false };
			const sessionManager = {
				getContext: vi.fn().mockReturnValue(sessionContext),
				applyRequest: vi.fn().mockReturnValue(appliedContext),
			};

			const pluginConfig = { enableCodexCompaction: false };
			const result = await transformRequestForCodex(
				{ body: JSON.stringify(body) },
				"https://chatgpt.com/backend-api/codex/responses",
				"instructions",
				{ global: {}, models: {} },
				true,
				sessionManager as never,
				pluginConfig as any,
			);

			expect(transformRequestBodyMock).toHaveBeenCalledTimes(1);
			const [_passedBody, _passedInstructions, _passedUserConfig, _passedCodexMode, optionsArg] =
				transformRequestBodyMock.mock.calls[0];

			expect(Array.isArray(optionsArg?.compaction?.originalInput)).toBe(true);
			expect(optionsArg?.compaction?.originalInput).not.toBe(body.input);

			body.input[0].content = "mutated";
			expect(optionsArg?.compaction?.originalInput?.[0].content).toBe("hello");

			expect(result?.body).toEqual(transformed);
			// Note: updatedInit.body is serialized once from transformResult.body and won't reflect later mutations to transformResult.body
			expect(result?.updatedInit.body).toBe(JSON.stringify(transformed));
		});

		it("prefers session prompt cache key when host did not provide one", async () => {
			const body = {
				model: "gpt-5",
				tools: [],
				input: [{ type: "message", role: "user", content: "hi" }],
			};
			const transformed = { ...body };
			transformRequestBodyMock.mockResolvedValue({ body: transformed });
			const sessionContext = {
				sessionId: "session-1",
				enabled: true,
				preserveIds: true,
				state: {
					id: "session-1",
					promptCacheKey: "session-cache-key",
					store: false,
					lastInput: [],
					lastPrefixHash: null,
					lastUpdated: Date.now(),
				},
			};
			const sessionManager = {
				getContext: vi.fn().mockReturnValue(sessionContext),
				applyRequest: vi.fn().mockReturnValue(sessionContext),
			};

			await transformRequestForCodex(
				{ body: JSON.stringify(body) },
				"https://chatgpt.com/backend-api/codex/responses",
				"instructions",
				{ global: {}, models: {} },
				true,
				sessionManager as never,
				{ enableCodexCompaction: false } as any,
			);

			const [passedBody] = transformRequestBodyMock.mock.calls[0];
			expect((passedBody as any).prompt_cache_key).toBe("session-cache-key");
		});

		it("preserves host-provided prompt_cache_key and does not overwrite with session cache key", async () => {
			const body = {
				model: "gpt-5",
				tools: [],
				input: [{ type: "message", role: "user", content: "hi" }],
				prompt_cache_key: "host-provided-key",
			};
			const transformed = { ...body };
			transformRequestBodyMock.mockResolvedValue({ body: transformed });
			const sessionContext = {
				sessionId: "session-1",
				enabled: true,
				preserveIds: true,
				state: {
					id: "session-1",
					promptCacheKey: "session-cache-key",
					store: false,
					lastInput: [],
					lastPrefixHash: null,
					lastUpdated: Date.now(),
				},
			};
			const sessionManager = {
				getContext: vi.fn().mockReturnValue(sessionContext),
				applyRequest: vi.fn().mockReturnValue(sessionContext),
			};

			await transformRequestForCodex(
				{ body: JSON.stringify(body) },
				"https://chatgpt.com/backend-api/codex/responses",
				"instructions",
				{ global: {}, models: {} },
				true,
				sessionManager as never,
				{ enableCodexCompaction: false } as any,
			);

			const [passedBody] = transformRequestBodyMock.mock.calls[0];
			expect((passedBody as any).prompt_cache_key).toBe("host-provided-key");
		});
	});

	describe("response handlers", () => {
		it("handleErrorResponse logs and replays response content", async () => {
			const response = new Response("failure", {
				status: 418,
				statusText: "I'm a teapot",
				headers: { "content-type": "text/plain" },
			});

			const result = await handleErrorResponse(response);
			expect(result.status).toBe(418);
			expect(await result.text()).toBe("failure");
			expect(logErrorMock).toHaveBeenCalledWith("418 error", { body: "failure" });
		});

		it("handleSuccessResponse converts SSE when no tools", async () => {
			const response = new Response("stream");
			const converted = new Response("converted");
			ensureContentTypeMock.mockImplementation(() => new Headers({ "content-type": "text/plain" }));
			convertSseToJsonMock.mockResolvedValue(converted);

			const result = await handleSuccessResponse(response, false);
			expect(ensureContentTypeMock).toHaveBeenCalled();
			expect(convertSseToJsonMock).toHaveBeenCalled();
			expect(result).toBe(converted);
		});

		it("handleSuccessResponse returns streaming response when tools present", async () => {
			const response = new Response("stream-body", {
				status: 200,
				statusText: "OK",
				headers: { "content-type": "text/event-stream" },
			});
			const headers = new Headers({ "content-type": "text/event-stream" });
			ensureContentTypeMock.mockReturnValue(headers);

			const result = await handleSuccessResponse(response, true);
			expect(result.status).toBe(200);
			expect(result.headers.get("content-type")).toBe("text/event-stream");
			expect(convertSseToJsonMock).not.toHaveBeenCalled();
		});
	});

	describe("handleErrorResponse", () => {
		it("enriches usage limit errors with friendly message and rate limits", async () => {
			const body = {
				error: {
					code: "usage_limit_reached",
					message: "limit reached",
					plan_type: "pro",
				},
			};
			const headers = new Headers({
				"x-codex-primary-used-percent": "75",
				"x-codex-primary-window-minutes": "300",
				"x-codex-primary-reset-at": String(Math.floor(Date.now() / 1000) + 1800),
			});
			const resp = new Response(JSON.stringify(body), { status: 429, headers });
			const enriched = await handleErrorResponse(resp);
			expect(enriched.status).toBe(429);
			const json = (await enriched.json()) as any;
			expect(json.error).toBeTruthy();
			expect(json.error.friendly_message).toMatch(/usage limit/i);
			expect(json.error.friendly_message).toContain("pro plan");
			expect(json.error.message).toBe("limit reached");
			expect(json.error.rate_limits.primary.used_percent).toBe(75);
			expect(json.error.rate_limits.primary.window_minutes).toBe(300);
			expect(typeof json.error.rate_limits.primary.resets_at).toBe("number");
		});

		it("preserves original error message for non-usage-limit 429 errors", async () => {
			const body = {
				error: {
					code: "upstream_timeout",
					message: "Upstream service timeout",
				},
			};
			const resp = new Response(JSON.stringify(body), { status: 429 });
			const enriched = await handleErrorResponse(resp);
			expect(enriched.status).toBe(429);
			const json = (await enriched.json()) as any;
			expect(json.error.message).toBe("Upstream service timeout");
			expect(json.error.friendly_message).toBeUndefined();
		});

		it("handles non-429 errors without usage-limit messaging", async () => {
			const body = {
				error: {
					code: "internal_server_error",
				},
			};
			const resp = new Response(JSON.stringify(body), { status: 500 });
			const enriched = await handleErrorResponse(resp);
			expect(enriched.status).toBe(500);
			const json = (await enriched.json()) as any;
			expect(json.error.message).toBe("Request failed with status 500.");
			expect(json.error.friendly_message).toBeUndefined();
		});

		it("preserves original message for errors with message field", async () => {
			const body = {
				error: {
					code: "validation_error",
					message: "Invalid input parameter",
				},
			};
			const resp = new Response(JSON.stringify(body), { status: 400 });
			const enriched = await handleErrorResponse(resp);
			expect(enriched.status).toBe(400);
			const json = (await enriched.json()) as any;
			expect(json.error.message).toBe("Invalid input parameter");
			expect(json.error.friendly_message).toBeUndefined();
		});

		it("handles non-JSON error bodies gracefully", async () => {
			const rawError = "<html>502 Bad Gateway</html>";
			const resp = new Response(rawError, { status: 502 });
			const enriched = await handleErrorResponse(resp);
			expect(enriched.status).toBe(502);
			expect(await enriched.text()).toBe(rawError);
		});

		it("handles usage_not_included error type", async () => {
			const body = {
				error: {
					type: "usage_not_included",
					plan_type: "free",
				},
			};
			const resp = new Response(JSON.stringify(body), { status: 403 });
			const enriched = await handleErrorResponse(resp);
			expect(enriched.status).toBe(403);
			const json = (await enriched.json()) as any;
			expect(json.error.friendly_message).toContain("usage limit");
			expect(json.error.friendly_message).toContain("free plan");
			expect(json.error.message).toContain("usage limit");
		});
	});
});
