import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REDIRECT_URI } from "../lib/auth/auth.js";

const fetchMock = vi.fn();
const codexFetchMock = vi.hoisted(() => vi.fn());
const decodeJWTMock = vi.hoisted(() =>
	vi.fn(() => ({
		"https://api.openai.com/auth": { chatgpt_account_id: "acc-123" },
	})),
);
const loadPluginConfigMock = vi.hoisted(() => vi.fn(() => ({ enablePromptCaching: true })));
const getCodexModeMock = vi.hoisted(() => vi.fn(() => true));
const getCodexInstructionsMock = vi.hoisted(() => vi.fn(() => Promise.resolve("instructions")));
const areCachesWarmMock = vi.hoisted(() => vi.fn(() => Promise.resolve(false)));
const warmCachesOnStartupMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const createAuthorizationFlowMock = vi.hoisted(() => vi.fn());
const exchangeAuthorizationCodeMock = vi.hoisted(() => vi.fn());
const startLocalOAuthServerMock = vi.hoisted(() => vi.fn());
const openBrowserUrlMock = vi.hoisted(() => vi.fn());
const logWarnMock = vi.hoisted(() => vi.fn());
const logErrorMock = vi.hoisted(() => vi.fn());
const sessionManagerInstance = vi.hoisted(() => ({
	getContext: vi.fn(() => ({ sessionId: "session-1", preserveIds: true, enabled: true })),
	applyRequest: vi.fn((_body, ctx) => ({ ...ctx, applied: true })),
	recordResponse: vi.fn(),
}));
const SessionManagerMock = vi.hoisted(() => vi.fn(() => sessionManagerInstance));
const createCodexFetcherMock = vi.hoisted(() => vi.fn(() => codexFetchMock));

const getLastCallArgument = (calls: any[][], index: number): any => {
	if (!calls.length) {
		return undefined;
	}
	const lastCall = calls[calls.length - 1];
	return lastCall[index];
};

vi.mock("../lib/auth/auth.js", async () => {
	const actual = await vi.importActual<typeof import("../lib/auth/auth.js")>("../lib/auth/auth.js");
	return {
		...actual,
		decodeJWT: decodeJWTMock,
		createAuthorizationFlow: createAuthorizationFlowMock,
		exchangeAuthorizationCode: exchangeAuthorizationCodeMock,
	};
});

vi.mock("../lib/auth/server.js", () => ({
	__esModule: true,
	startLocalOAuthServer: startLocalOAuthServerMock,
}));

vi.mock("../lib/auth/browser.js", () => ({
	__esModule: true,
	openBrowserUrl: openBrowserUrlMock,
}));

vi.mock("../lib/config.js", () => ({
	__esModule: true,
	loadPluginConfig: loadPluginConfigMock,
	getCodexMode: getCodexModeMock,
}));

vi.mock("../lib/prompts/codex.js", () => ({
	__esModule: true,
	getCodexInstructions: getCodexInstructionsMock,
}));

vi.mock("../lib/cache/cache-warming.js", () => ({
	__esModule: true,
	areCachesWarm: areCachesWarmMock,
	warmCachesOnStartup: warmCachesOnStartupMock,
}));

vi.mock("../lib/request/codex-fetcher.js", () => ({
	__esModule: true,
	createCodexFetcher: createCodexFetcherMock,
}));

vi.mock("../lib/session/session-manager.js", () => ({
	__esModule: true,
	SessionManager: SessionManagerMock,
}));

vi.mock("../lib/logger.js", () => ({
	__esModule: true,
	configureLogger: vi.fn(),
	logWarn: logWarnMock,
	logError: logErrorMock,
}));

describe("OpenAIAuthPlugin", () => {
	beforeEach(() => {
		vi.resetModules();
		fetchMock.mockReset();
		globalThis.fetch = fetchMock as typeof fetch;
		codexFetchMock.mockReset();
		codexFetchMock.mockResolvedValue(new Response("OK", { status: 200 }));
		createCodexFetcherMock.mockReset();
		createCodexFetcherMock.mockReturnValue(codexFetchMock);
		decodeJWTMock.mockReset();
		decodeJWTMock.mockReturnValue({
			"https://api.openai.com/auth": { chatgpt_account_id: "acc-123" },
		});
		loadPluginConfigMock.mockReset();
		loadPluginConfigMock.mockReturnValue({ enablePromptCaching: true });
		getCodexModeMock.mockReset();
		getCodexModeMock.mockReturnValue(true);
		getCodexInstructionsMock.mockClear();
		areCachesWarmMock.mockReset();
		areCachesWarmMock.mockResolvedValue(false);
		warmCachesOnStartupMock.mockReset();
		warmCachesOnStartupMock.mockResolvedValue(undefined);
		createAuthorizationFlowMock.mockReset();
		exchangeAuthorizationCodeMock.mockReset();
		startLocalOAuthServerMock.mockReset();
		openBrowserUrlMock.mockReset();
		SessionManagerMock.mockReset();
		logWarnMock.mockReset();
		logErrorMock.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("returns empty loader result for non-oauth auth types", async () => {
		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const loaderResult = await plugin.auth?.loader?.(async () => ({ type: "api" }) as any, {} as any);
		expect(loaderResult).toEqual({});
		expect(createCodexFetcherMock).not.toHaveBeenCalled();
	});

	it("wires codex fetcher with derived dependencies", async () => {
		const providerOverrides = {
			options: { reasoningEffort: "high" },
			models: { "gpt-5": { options: { reasoningEffort: "low" } } },
		};

		const fetcherInstance = vi.fn();
		createCodexFetcherMock.mockReturnValue(fetcherInstance);

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const getAuth = vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		});

		const config = await plugin.auth?.loader?.(getAuth, providerOverrides as any);
		expect(config?.fetch).toBe(fetcherInstance);
		const createFetcherArgs = getLastCallArgument(createCodexFetcherMock.mock.calls, 0);
		expect(createFetcherArgs).toEqual(
			expect.objectContaining({
				getAuth,
				accountId: "acc-123",
				userConfig: {
					global: providerOverrides.options,
					models: providerOverrides.models,
				},
				codexMode: true,
				sessionManager: expect.any(Object),
				codexInstructions: "instructions",
			}),
		);
	});

	it("handles missing account ID", async () => {
		decodeJWTMock.mockReturnValue({ "https://api.openai.com/auth": {} as any });

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const getAuth = vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		});

		const loaderResult = await plugin.auth?.loader?.(getAuth, {} as any);
		expect(loaderResult).toEqual({});
		expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining("Failed to extract accountId"));
	});

	it("handles undefined decoded payload", async () => {
		decodeJWTMock.mockReturnValue(undefined as any);

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const getAuth = vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		});

		const loaderResult = await plugin.auth?.loader?.(getAuth, {} as any);
		expect(loaderResult).toEqual({});
		expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining("Failed to extract accountId"));
	});

	it("defaults provider config to empty objects", async () => {
		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const getAuth = vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		});

		await plugin.auth?.loader?.(getAuth, undefined as any);
		const createFetcherArgs = getLastCallArgument(createCodexFetcherMock.mock.calls, 0);
		expect(createFetcherArgs?.userConfig).toEqual({ global: {}, models: {} });
	});

	it("defaults prompt caching to true when config omits the flag", async () => {
		loadPluginConfigMock.mockReturnValue({} as any);

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const getAuth = vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		});

		await plugin.auth?.loader?.(getAuth, {} as any);
		const sessionArgs = getLastCallArgument(SessionManagerMock.mock.calls, 0);
		expect(sessionArgs).toEqual({ enabled: true });
		expect(logWarnMock).not.toHaveBeenCalledWith(expect.stringContaining("Prompt caching disabled"));
	});

	it("handles disabled prompt caching", async () => {
		loadPluginConfigMock.mockReturnValue({ enablePromptCaching: false });

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const getAuth = vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		});

		await plugin.auth?.loader?.(getAuth, {} as any);
		expect(logWarnMock).toHaveBeenCalledWith(expect.stringContaining("Prompt caching disabled"));
		const sessionArgs = getLastCallArgument(SessionManagerMock.mock.calls, 0);
		expect(sessionArgs).toEqual({ enabled: false });
	});

	it("handles cache warming failure gracefully", async () => {
		areCachesWarmMock.mockResolvedValue(false);
		warmCachesOnStartupMock.mockRejectedValue(new Error("boom"));

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const getAuth = vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		});

		await plugin.auth?.loader?.(getAuth, {} as any);
		expect(logWarnMock).toHaveBeenCalledWith("Cache warming failed, continuing", expect.any(Object));
	});

	it("skips warming when caches already warm", async () => {
		areCachesWarmMock.mockResolvedValue(true);

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);
		const getAuth = vi.fn().mockResolvedValue({
			type: "oauth",
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		});

		await plugin.auth?.loader?.(getAuth, {} as any);
		expect(warmCachesOnStartupMock).not.toHaveBeenCalled();
	});

	it("runs the OAuth authorize flow and exchanges tokens", async () => {
		const flow = {
			pkce: { challenge: "challenge", verifier: "verifier" },
			state: "state-123",
			url: "https://codex.local/auth",
		};
		createAuthorizationFlowMock.mockResolvedValue(flow);
		const waitForCode = vi.fn().mockResolvedValue({ code: "auth-code" });
		const closeMock = vi.fn();
		startLocalOAuthServerMock.mockResolvedValue({ waitForCode, close: closeMock });
		const tokenResponse = {
			type: "success" as const,
			access: "access-token",
			refresh: "refresh-token",
			expires: Date.now() + 10_000,
		};
		exchangeAuthorizationCodeMock.mockResolvedValue(tokenResponse);

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);

		const oauthMethod = plugin.auth?.methods?.find((method) => method.type === "oauth");
		if (!oauthMethod) throw new Error("OAuth method not registered");

		const authorizeResult = await oauthMethod.authorize();
		expect(openBrowserUrlMock).toHaveBeenCalledWith(flow.url);
		expect(startLocalOAuthServerMock).toHaveBeenCalledWith({ state: flow.state });

		const callbackResult = await authorizeResult.callback();
		expect(waitForCode).toHaveBeenCalledWith(flow.state);
		expect(closeMock).toHaveBeenCalled();
		expect(exchangeAuthorizationCodeMock).toHaveBeenCalledWith("auth-code", flow.pkce.verifier, REDIRECT_URI);
		expect(callbackResult).toEqual(tokenResponse);
	});

	it("returns a failed authorize callback when no code is provided", async () => {
		const flow = {
			pkce: { challenge: "challenge", verifier: "verifier" },
			state: "state-456",
			url: "https://codex.local/auth",
		};
		createAuthorizationFlowMock.mockResolvedValue(flow);
		const waitForCode = vi.fn().mockResolvedValue(null);
		const closeMock = vi.fn();
		startLocalOAuthServerMock.mockResolvedValue({ waitForCode, close: closeMock });
		exchangeAuthorizationCodeMock.mockResolvedValue({
			type: "success",
			access: "token",
			refresh: "refresh",
			expires: 1,
		});

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);

		const oauthMethod = plugin.auth?.methods?.find((method) => method.type === "oauth");
		if (!oauthMethod) throw new Error("OAuth method not registered");

		const authorizeResult = await oauthMethod.authorize();
		const callbackResult = await authorizeResult.callback();
		expect(waitForCode).toHaveBeenCalledWith(flow.state);
		expect(closeMock).toHaveBeenCalled();
		expect(exchangeAuthorizationCodeMock).not.toHaveBeenCalled();
		expect(callbackResult).toEqual({ type: "failed" });
	});

	it("returns failed authorize callback when token exchange is unsuccessful", async () => {
		const flow = {
			pkce: { challenge: "challenge", verifier: "verifier" },
			state: "state-789",
			url: "https://codex.local/auth",
		};
		createAuthorizationFlowMock.mockResolvedValue(flow);
		const waitForCode = vi.fn().mockResolvedValue({ code: "auth-code" });
		const closeMock = vi.fn();
		startLocalOAuthServerMock.mockResolvedValue({ waitForCode, close: closeMock });
		exchangeAuthorizationCodeMock.mockResolvedValue({ type: "failed" } as const);

		const { OpenAIAuthPlugin } = await import("../index.js");
		const plugin = await OpenAIAuthPlugin({
			client: { auth: { set: vi.fn() } },
			project: "",
			directory: "",
			worktree: "",
			$: vi.fn(),
		} as never);

		const oauthMethod = plugin.auth?.methods?.find((method) => method.type === "oauth");
		if (!oauthMethod) throw new Error("OAuth method not registered");

		const authorizeResult = await oauthMethod.authorize();
		const callbackResult = await authorizeResult.callback();
		expect(waitForCode).toHaveBeenCalledWith(flow.state);
		expect(closeMock).toHaveBeenCalled();
		expect(exchangeAuthorizationCodeMock).toHaveBeenCalledWith("auth-code", flow.pkce.verifier, REDIRECT_URI);
		expect(callbackResult).toEqual({ type: "failed" });
	});
});
