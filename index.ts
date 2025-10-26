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
 * @author numman-ali
 * @repository https://github.com/numman-ali/opencode-openai-codex-auth
 */

import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Auth } from "@opencode-ai/sdk";
import { createAuthorizationFlow, exchangeAuthorizationCode, decodeJWT, REDIRECT_URI } from "./lib/auth/auth.js";
import { getCodexInstructions } from "./lib/prompts/codex.js";
import { startLocalOAuthServer } from "./lib/auth/server.js";
import { logRequest, logDebug } from "./lib/logger.js";
import { openBrowserUrl } from "./lib/auth/browser.js";
import {
	shouldRefreshToken,
	refreshAndUpdateToken,
	extractRequestUrl,
	rewriteUrlForCodex,
	transformRequestForCodex,
	createCodexHeaders,
	handleErrorResponse,
	handleSuccessResponse,
} from "./lib/request/fetch-helpers.js";
import { loadPluginConfig, getCodexMode } from "./lib/config.js";
import { SessionManager } from "./lib/session/session-manager.js";
import type { UserConfig } from "./lib/types.js";
import {
	DUMMY_API_KEY,
	CODEX_BASE_URL,
	PROVIDER_ID,
	JWT_CLAIM_PATH,
	PLUGIN_NAME,
	ERROR_MESSAGES,
	LOG_STAGES,
	AUTH_LABELS,
} from "./lib/constants.js";

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
 *   "plugin": ["opencode-openai-codex-auth"],
 *   "model": "openai/gpt-5-codex"
 * }
 * ```
 */
export const OpenAIAuthPlugin: Plugin = async ({ client }: PluginInput) => {
	return {
		auth: {
			provider: PROVIDER_ID,
			/**
			 * Loader function that configures OAuth authentication and request handling
			 *
			 * This function:
			 * 1. Validates OAuth authentication
			 * 2. Extracts ChatGPT account ID from access token
			 * 3. Loads user configuration from opencode.json
			 * 4. Fetches Codex system instructions from GitHub (cached)
			 * 5. Returns SDK configuration with custom fetch implementation
			 *
			 * @param getAuth - Function to retrieve current auth state
			 * @param provider - Provider configuration from opencode.json
			 * @returns SDK configuration object or empty object for non-OAuth auth
			 */
			async loader(getAuth: () => Promise<Auth>, provider: unknown) {
				const auth = await getAuth();

				// Only handle OAuth auth type, skip API key auth
				if (auth.type !== "oauth") {
					return {};
				}

				// Extract ChatGPT account ID from JWT access token
				const decoded = decodeJWT(auth.access);
				const accountId = decoded?.[JWT_CLAIM_PATH]?.chatgpt_account_id;

				if (!accountId) {
					console.error(`[${PLUGIN_NAME}] ${ERROR_MESSAGES.NO_ACCOUNT_ID}`);
					return {};
				}

				// Extract user configuration (global + per-model options)
				const providerConfig = provider as { options?: Record<string, unknown>; models?: UserConfig["models"] } | undefined;
				const userConfig: UserConfig = {
					global: providerConfig?.options || {},
					models: providerConfig?.models || {},
				};

			// Load plugin configuration and determine CODEX_MODE
			// Priority: CODEX_MODE env var > config file > default (true)
			const pluginConfig = loadPluginConfig();
			const codexMode = getCodexMode(pluginConfig);
			const promptCachingEnabled = pluginConfig.enablePromptCaching ?? false;
			const sessionManager = new SessionManager({
				enabled: promptCachingEnabled,
			});

				// Fetch Codex system instructions (cached with ETag for efficiency)
				const CODEX_INSTRUCTIONS = await getCodexInstructions();

				// Return SDK configuration
				return {
					apiKey: DUMMY_API_KEY,
					baseURL: CODEX_BASE_URL,
					/**
					 * Custom fetch implementation for Codex API
					 *
					 * Handles:
					 * - Token refresh when expired
					 * - URL rewriting for Codex backend
					 * - Request body transformation
					 * - OAuth header injection
					 * - SSE to JSON conversion for non-tool requests
					 * - Error handling and logging
					 *
					 * @param input - Request URL or Request object
					 * @param init - Request options
					 * @returns Response from Codex API
					 */
					async fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> {
						// Step 1: Check and refresh token if needed
						const currentAuth = await getAuth();
						if (shouldRefreshToken(currentAuth)) {
							const refreshResult = await refreshAndUpdateToken(currentAuth, client);
							if (!refreshResult.success) {
								return refreshResult.response;
							}
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
						const headers = createCodexHeaders(requestInit, accountId, accessToken);

						// Step 5: Make request to Codex API
						const response = await fetch(url, {
							...requestInit,
							headers,
						});

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
							const payload = await handledResponse.clone().json();
							sessionManager.recordResponse(sessionContext, payload);
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
					/**
					 * OAuth authorization flow
					 *
					 * Steps:
					 * 1. Generate PKCE challenge and state for security
					 * 2. Start local OAuth callback server on port 1455
					 * 3. Open browser to OpenAI authorization page
					 * 4. Wait for user to complete login
					 * 5. Exchange authorization code for tokens
					 *
					 * @returns Authorization flow configuration
					 */
					authorize: async () => {
						const { pkce, state, url } = await createAuthorizationFlow();
						const serverInfo = await startLocalOAuthServer({ state });

						// Attempt to open browser automatically
						openBrowserUrl(url);

						return {
							url,
							method: "auto" as const,
							instructions: AUTH_LABELS.INSTRUCTIONS,
							callback: async () => {
								const result = await serverInfo.waitForCode(state);
								serverInfo.close();

								if (!result) {
									return { type: "failed" as const };
								}

								const tokens = await exchangeAuthorizationCode(
									result.code,
									pkce.verifier,
									REDIRECT_URI,
								);

								return tokens?.type === "success"
									? tokens
									: { type: "failed" as const };
							},
						};
					},
				},
				{
					label: AUTH_LABELS.API_KEY,
					type: "api" as const,
				},
			],
		},
	};
};

export default OpenAIAuthPlugin;
