import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_STAGES } from "../lib/constants.js";
import { createCodexFetcher } from "../lib/request/codex-fetcher.js";
import type { SessionManager } from "../lib/session/session-manager.js";

const fetchMock = vi.fn();
const shouldRefreshTokenMock = vi.hoisted(() => vi.fn(() => false));
const refreshAndUpdateTokenMock = vi.hoisted(() => vi.fn());
const extractRequestUrlMock = vi.hoisted(() => vi.fn((input: string | URL | Request) => input.toString()));
const rewriteUrlForCodexMock = vi.hoisted(() => vi.fn(() => "https://codex/backend"));
const transformRequestForCodexMock = vi.hoisted(() => vi.fn());
const createCodexHeadersMock = vi.hoisted(() => vi.fn(() => new Headers({ Authorization: "Bearer token" })));
const handleErrorResponseMock = vi.hoisted(() => vi.fn());
const handleSuccessResponseMock = vi.hoisted(() => vi.fn());
const maybeHandleCodexCommandMock = vi.hoisted(() =>
	vi.fn<(body: unknown, context: unknown) => Response | null>(() => null),
);
const logRequestMock = vi.hoisted(() => vi.fn());
const recordSessionResponseMock = vi.hoisted(() => vi.fn());
const finalizeCompactionResponseMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/request/fetch-helpers.js", () => ({
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

vi.mock("../lib/commands/codex-metrics.js", () => ({
	__esModule: true,
	maybeHandleCodexCommand: maybeHandleCodexCommandMock,
}));

vi.mock("../lib/logger.js", () => ({
	__esModule: true,
	logRequest: logRequestMock,
}));

vi.mock("../lib/session/response-recorder.js", () => ({
	__esModule: true,
	recordSessionResponseFromHandledResponse: recordSessionResponseMock,
}));

vi.mock("../lib/compaction/compaction-executor.js", () => ({
	__esModule: true,
	finalizeCompactionResponse: finalizeCompactionResponseMock,
}));

describe("createCodexFetcher", () => {
	const sessionManager = {
		recordResponse: vi.fn(),
		getContext: vi.fn(),
		applyRequest: vi.fn(),
	} as unknown as SessionManager;

	beforeEach(() => {
		vi.resetModules();
		globalThis.fetch = fetchMock as typeof fetch;
		fetchMock.mockReset();
		fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));
		shouldRefreshTokenMock.mockReset();
		shouldRefreshTokenMock.mockReturnValue(false);
		refreshAndUpdateTokenMock.mockReset();
		transformRequestForCodexMock.mockReset();
		createCodexHeadersMock.mockReset();
		handleErrorResponseMock.mockReset();
		handleSuccessResponseMock.mockReset();
		handleSuccessResponseMock.mockResolvedValue(new Response("handled", { status: 200 }));
		maybeHandleCodexCommandMock.mockReset();
		maybeHandleCodexCommandMock.mockReturnValue(null);
		logRequestMock.mockClear();
		recordSessionResponseMock.mockReset();
	});

	const baseDeps = () => ({
		getAuth: vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		}),
		client: { auth: { set: vi.fn() } } as any,
		accountId: "acc-123",
		userConfig: { global: {}, models: {} },
		codexMode: true,
		sessionManager,
		codexInstructions: "instructions",
		pluginConfig: {
			codexMode: true,
			enablePromptCaching: true,
			enableCodexCompaction: true,
			autoCompactMinMessages: 8,
		},
	});

	it("performs the Codex fetch flow end-to-end", async () => {
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5", tools: [] },
			updatedInit: { body: JSON.stringify({ model: "gpt-5" }) },
			sessionContext: { sessionId: "s-1", enabled: true },
		});

		const fetcher = createCodexFetcher(baseDeps());
		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
		});

		expect(extractRequestUrlMock).toHaveBeenCalled();
		expect(rewriteUrlForCodexMock).toHaveBeenCalled();
		expect(transformRequestForCodexMock).toHaveBeenCalledWith(
			expect.anything(),
			"https://codex/backend",
			"instructions",
			{ global: {}, models: {} },
			true,
			sessionManager,
			{
				codexMode: true,
				enablePromptCaching: true,
				enableCodexCompaction: true,
				autoCompactMinMessages: 8,
			},
		);
		expect(maybeHandleCodexCommandMock).toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalled();
		expect(logRequestMock).toHaveBeenCalled();
		expect(recordSessionResponseMock).toHaveBeenCalledWith({
			sessionManager,
			sessionContext: { sessionId: "s-1", enabled: true },
			handledResponse: expect.any(Response),
		});
		expect(handleSuccessResponseMock).toHaveBeenCalledWith(expect.any(Response), true);
		expect(response.status).toBe(200);
	});

	it("refreshes tokens and returns refresh failure response", async () => {
		shouldRefreshTokenMock.mockReturnValue(true);
		const refreshFailure = new Response("refresh failed", { status: 401 });
		refreshAndUpdateTokenMock.mockResolvedValue({ success: false, response: refreshFailure });

		const deps = baseDeps();
		const fetcher = createCodexFetcher(deps);
		const response = await fetcher("https://api.openai.com", {});

		expect(response).toBe(refreshFailure);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("continues processing when token refresh succeeds", async () => {
		shouldRefreshTokenMock.mockReturnValue(true);
		refreshAndUpdateTokenMock.mockResolvedValue({
			success: true,
			auth: {
				type: "oauth" as const,
				access: "new-access",
				refresh: "new-refresh",
				expires: Date.now() + 20_000,
			},
		});
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5" },
		});

		const fetcher = createCodexFetcher(baseDeps());
		await fetcher("https://api.openai.com", {});
		expect(refreshAndUpdateTokenMock).toHaveBeenCalled();
		expect(fetchMock).toHaveBeenCalled();
	});

	it("uses refreshed auth when refresh succeeds", async () => {
		shouldRefreshTokenMock.mockReturnValue(true);
		refreshAndUpdateTokenMock.mockResolvedValue({
			success: true,
			auth: {
				type: "oauth" as const,
				access: "refreshed-access",
				refresh: "refreshed-refresh",
				expires: Date.now() + 10_000,
			},
		});
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5" },
		});

		const fetcher = createCodexFetcher(baseDeps());
		await fetcher("https://api.openai.com", {});
		expect(createCodexHeadersMock).toHaveBeenCalledWith(
			expect.any(Object),
			"acc-123",
			"refreshed-access",
			expect.any(Object),
		);
	});

	it("returns command response early when maybeHandleCodexCommand matches", async () => {
		const commandResponse = new Response("command", { status: 200 });
		maybeHandleCodexCommandMock.mockReturnValue(commandResponse);
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5" },
			updatedInit: {},
		});

		const fetcher = createCodexFetcher(baseDeps());
		const response = await fetcher("https://api.openai.com", {});
		expect(response).toBe(commandResponse);
		expect(maybeHandleCodexCommandMock).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-5" }), {
			sessionManager,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("passes hasTools flag to the success handler", async () => {
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5", tools: undefined },
		});

		const fetcher = createCodexFetcher(baseDeps());
		await fetcher("https://api.openai.com", {});
		expect(handleSuccessResponseMock).toHaveBeenCalledWith(expect.any(Response), false);
	});

	it("delegates non-ok responses to the error handler", async () => {
		fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
		handleErrorResponseMock.mockResolvedValue(new Response("handled error", { status: 502 }));
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5" },
		});

		const fetcher = createCodexFetcher(baseDeps());
		const response = await fetcher("https://api.openai.com", {});
		expect(handleErrorResponseMock).toHaveBeenCalled();
		expect(response.status).toBe(502);
	});

	it("logs response metadata with the response stage", async () => {
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5" },
		});
		fetchMock.mockResolvedValue(new Response("ok", { status: 202, statusText: "accepted" }));

		const fetcher = createCodexFetcher(baseDeps());
		await fetcher("https://api.openai.com", {});
		expect(logRequestMock).toHaveBeenCalledWith(
			LOG_STAGES.RESPONSE,
			expect.objectContaining({ status: 202, statusText: "accepted" }),
		);
	});

	it("falls back to original init when no transformation occurs", async () => {
		transformRequestForCodexMock.mockResolvedValue(undefined);
		const deps = baseDeps();
		const fetcher = createCodexFetcher(deps);

		await fetcher("https://api.openai.com", { method: "POST", headers: { "x-test": "1" } });
		expect(createCodexHeadersMock).toHaveBeenCalledWith(
			{ method: "POST", headers: { "x-test": "1" } },
			"acc-123",
			"access-token",
			expect.objectContaining({ model: undefined, promptCacheKey: undefined }),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://codex/backend",
			expect.objectContaining({
				headers: expect.any(Headers),
				method: "POST",
			}),
		);
	});

	it("records responses only after successful handling", async () => {
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5" },
			sessionContext: { sessionId: "s-2", enabled: true },
		});
		handleSuccessResponseMock.mockResolvedValue(new Response("payload", { status: 200 }));

		const fetcher = createCodexFetcher(baseDeps());
		await fetcher("https://api.openai.com", {});
		expect(recordSessionResponseMock).toHaveBeenCalledWith({
			sessionManager,
			sessionContext: { sessionId: "s-2", enabled: true },
			handledResponse: expect.any(Response),
		});
	});

	it("handles compaction decision when present", async () => {
		const mockDecision = { type: "compact" as const, reason: "test" };
		const compactedResponse = new Response("compacted", { status: 200 });
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5" },
			sessionContext: { sessionId: "s-3", enabled: true },
			compactionDecision: mockDecision,
		});
		handleSuccessResponseMock.mockResolvedValue(new Response("payload", { status: 200 }));
		finalizeCompactionResponseMock.mockResolvedValue(compactedResponse);

		const fetcher = createCodexFetcher(baseDeps());
		const result = await fetcher("https://api.openai.com", {});

		// Verify finalizeCompactionResponse was called with correct parameters
		expect(finalizeCompactionResponseMock).toHaveBeenCalledWith({
			response: expect.any(Response),
			decision: mockDecision,
			sessionManager,
			sessionContext: { sessionId: "s-3", enabled: true },
		});

		// Verify recordSessionResponseFromHandledResponse was called with compacted response
		expect(recordSessionResponseMock).toHaveBeenCalledWith({
			sessionManager,
			sessionContext: { sessionId: "s-3", enabled: true },
			handledResponse: compactedResponse,
		});

		// Verify fetcher returns the compacted response
		expect(result).toBe(compactedResponse);
		expect(result.status).toBe(200);
		expect(await result.text()).toBe("compacted");
	});

	it("uses empty tokens when auth type is not oauth", async () => {
		transformRequestForCodexMock.mockResolvedValue({
			body: { model: "gpt-5" },
		});
		const deps = baseDeps();
		deps.getAuth.mockResolvedValue({ type: "api", key: "abc" } as any);

		const fetcher = createCodexFetcher(deps);
		await fetcher("https://api.openai.com", {});
		expect(createCodexHeadersMock).toHaveBeenCalledWith(
			expect.any(Object),
			"acc-123",
			"",
			expect.any(Object),
		);
	});
});
