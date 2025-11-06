/**
 * OpenAI ChatGPT (Codex) OAuth Authentication Plugin for opencode
 *
 * COMPLIANCE NOTICE:
 * This plugin uses OpenAI's official OAuth authentication flow (the same method
 * used by OpenAI's official Codex CLI at https://github.com/openai/codex).
 *
 * INTENDED USE: Personal development and coding assistance with your own
 * ChatGPT Plus/Pro subscription.
 *
 * NOT INTENDED FOR: Commercial resale, multi-user services, high-volume
 * automated extraction, or any use that violates OpenAI's Terms of Service.
 *
 * Users are responsible for ensuring their usage complies with:
 * - OpenAI Terms of Use: https://openai.com/policies/terms-of-use/
 * - OpenAI Usage Policies: https://openai.com/policies/usage-policies/
 *
 * For production applications, use the OpenAI Platform API: https://platform.openai.com/
 *
 * @license MIT with Usage Disclaimer (see LICENSE file)
 * @author riatzukiza
 * @repository https://github.com/riatzukiza/opencode-openai-codex-auth
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Auth } from "@opencode-ai/sdk";
import {
	createAuthorizationFlow,
	decodeJWT,
	exchangeAuthorizationCode,
	REDIRECT_URI,
} from "./lib/auth/auth.js";
import { openBrowserUrl } from "./lib/auth/browser.js";
import { startLocalOAuthServer } from "./lib/auth/server.js";
import { getCodexMode, loadPluginConfig } from "./lib/config.js";
import {
	AUTH_LABELS,
	CODEX_BASE_URL,
	DUMMY_API_KEY,
	ERROR_MESSAGES,
	JWT_CLAIM_PATH,
	LOG_STAGES,
	PLUGIN_NAME,
	PROVIDER_ID,
} from "./lib/constants.js";
import { logRequest, logDebug } from "./lib/logger.js";
import { getCodexInstructions } from "./lib/prompts/codex.js";
import { warmCachesOnStartup, areCachesWarm } from "./lib/cache/cache-warming.js";
import {
	createCodexHeaders,
	extractRequestUrl,
	handleErrorResponse,
	handleSuccessResponse,
	refreshAndUpdateToken,
	rewriteUrlForCodex,
	shouldRefreshToken,
	transformRequestForCodex,
} from "./lib/request/fetch-helpers.js";
import { SessionManager } from "./lib/session/session-manager.js";
import type { UserConfig, CodexResponsePayload } from "./lib/types.js";

/**
 * OpenAI Codex OAuth authentication plugin for opencode
 *
 * This plugin enables opencode to use OpenAI's Codex backend via ChatGPT Plus/Pro
 * OAuth authentication, allowing users to leverage their ChatGPT subscription
 * instead of OpenAI Platform API credits.
 *
 * @example
 * ```json
 * {
 *   "plugin": ["@promethean-os/opencode-openai-codex-auth"],
 *   "model": "openai/gpt-5-codex"
 * }
 * ```
 */
export const OpenAIAuthPlugin: Plugin = async ({ client }: PluginInput) => {
	function isCodexResponsePayload(payload: unknown): payload is CodexResponsePayload {
		if (!payload || typeof payload !== "object") return false;
		const usage = (payload as { usage?: unknown }).usage;
		if (usage !== undefined && (usage === null || typeof usage !== "object")) return false;
		if (
			usage &&
			"cached_tokens" in (usage as Record<string, unknown>) &&
			typeof (usage as Record<string, unknown>).cached_tokens !== "number"
		) {
			return false;
		}
		return true;
	}

	return {
		auth: {
			provider: PROVIDER_ID,
			/**
			 * Loader function that configures OAuth authentication and request handling
			 */
			async loader(getAuth: () => Promise<Auth>, provider: unknown) {
				const auth = await getAuth();
				if (auth.type !== "oauth") return {};

				// Extract ChatGPT account ID from JWT access token
				const decoded = decodeJWT(auth.access);
				const accountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
				if (!accountId) {
					console.error(`[${PLUGIN_NAME}] ${ERROR_MESSAGES.NO_ACCOUNT_ID}`);
					return {};
				}

				// Extract user configuration (global + per-model options)
				const providerConfig = provider as
					| { options?: Record<string, unknown>; models?: UserConfig["models"] }
					| undefined;
				const userConfig: UserConfig = {
					global: providerConfig?.options || {},
					models: providerConfig?.models || {},
				};

				// Load plugin configuration and determine CODEX_MODE
				const pluginConfig = loadPluginConfig();
				const codexMode = getCodexMode(pluginConfig);
				const promptCachingEnabled = pluginConfig.enablePromptCaching ?? false;
				const sessionManager = new SessionManager({ enabled: promptCachingEnabled });

				// Warm caches on startup for better first-request performance (non-blocking)
				const cachesAlreadyWarm = await areCachesWarm();
				if (!cachesAlreadyWarm) {
					try {
						await warmCachesOnStartup();
					} catch (error) {
						console.warn(
							`[${PLUGIN_NAME}] Cache warming failed, continuing: ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
					}
				}

				// Fetch Codex system instructions (cached with ETag for efficiency)
				const CODEX_INSTRUCTIONS = await getCodexInstructions();

				return {
					apiKey: DUMMY_API_KEY,
					baseURL: CODEX_BASE_URL,
					async fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> {
						// Step 1: Check and refresh token if needed
						const currentAuth = await getAuth();
						if (shouldRefreshToken(currentAuth)) {
							const refreshResult = await refreshAndUpdateToken(currentAuth, client);
							if (!refreshResult.success) return refreshResult.response;
						}

						// Step 2: Extract and rewrite URL for Codex backend
						const originalUrl = extractRequestUrl(input);
						const url = rewriteUrlForCodex(originalUrl);

						// Step 3: Transform request body with Codex instructions
						const transformation = await transformRequestForCodex(
							init,
							url,
							CODEX_INSTRUCTIONS,
							userConfig,
							codexMode,
							sessionManager,
						);
						const hasTools = transformation?.body.tools !== undefined;
						const requestInit = transformation?.updatedInit ?? init;
						const sessionContext = transformation?.sessionContext;

						// Step 4: Create headers with OAuth and ChatGPT account info
						const accessToken = currentAuth.type === "oauth" ? currentAuth.access : "";
						const headers = createCodexHeaders(requestInit, accountId, accessToken, {
							model: transformation?.body.model,
							promptCacheKey: (transformation?.body as any)?.prompt_cache_key,
						});

						// Step 5: Make request to Codex API
						const response = await fetch(url, { ...requestInit, headers });

						// Step 6: Log response
						logRequest(LOG_STAGES.RESPONSE, {
							status: response.status,
							ok: response.ok,
							statusText: response.statusText,
							headers: Object.fromEntries(response.headers.entries()),
						});

						// Step 7: Handle error or success response
						if (!response.ok) {
							return await handleErrorResponse(response);
						}

						const handledResponse = await handleSuccessResponse(response, hasTools);

						if (
							sessionContext &&
							handledResponse.headers.get("content-type")?.includes("application/json")
						) {
							try {
								const payload = (await handledResponse.clone().json()) as unknown;
								if (isCodexResponsePayload(payload)) {
									sessionManager.recordResponse(sessionContext, payload);
								}
							} catch (error) {
								logDebug("SessionManager: failed to parse response payload", {
									error: (error as Error).message,
								});
							}
						}

						return handledResponse;
					},
				};
			},
			methods: [
				{
					label: AUTH_LABELS.OAUTH,
					type: "oauth" as const,
					authorize: async () => {
						const { pkce, state, url } = await createAuthorizationFlow();
						const serverInfo = await startLocalOAuthServer({ state });
						openBrowserUrl(url);
						return {
							url,
							method: "auto" as const,
							instructions: AUTH_LABELS.INSTRUCTIONS,
							callback: async () => {
								const result = await serverInfo.waitForCode(state);
								serverInfo.close();
								if (!result) return { type: "failed" as const };
								const tokens = await exchangeAuthorizationCode(
									result.code,
									pkce.verifier,
									REDIRECT_URI,
								);
								return tokens?.type === "success" ? tokens : ({ type: "failed" } as const);
							},
						};
					},
				},
				{ label: AUTH_LABELS.API_KEY, type: "api" as const },
			],
		},
	};
};

export default OpenAIAuthPlugin;
