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
 * @license GPL-3.0-only (see LICENSE file)
 * @author Open Hax
 * @repository https://github.com/open-hax/codex
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
  PROVIDER_ID,
} from "./lib/constants.js";
import { configureLogger, logWarn, logError } from "./lib/logger.js";
import { getCodexInstructions } from "./lib/prompts/codex.js";
import { warmCachesOnStartup, areCachesWarm } from "./lib/cache/cache-warming.js";
import { createCodexFetcher } from "./lib/request/codex-fetcher.js";
import { SessionManager } from "./lib/session/session-manager.js";
import type { UserConfig } from "./lib/types.js";

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
 *   "plugin": ["@openhax/codex"],
 *   "model": "openai/gpt-5-codex"
 * }
 * ```
 */
export const OpenAIAuthPlugin: Plugin = async ({ client, directory }: PluginInput) => {
  configureLogger({ client, directory });
  setTimeout(() => {
    logWarn(
      "The OpenAI Codex plugin is intended for personal use with your own ChatGPT Plus/Pro subscription. Ensure your usage complies with OpenAI's Terms of Service.",
    );
  }, 5000);
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
          logError(ERROR_MESSAGES.NO_ACCOUNT_ID);
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
        const promptCachingEnabled = pluginConfig.enablePromptCaching ?? true;
        if (!promptCachingEnabled) {
          logWarn(
            "Prompt caching disabled via config; Codex may use more tokens and cache hit diagnostics will be limited.",
          );
        }
        const sessionManager = new SessionManager({ enabled: promptCachingEnabled });

        // Warm caches on startup for better first-request performance (non-blocking)
        const cachesAlreadyWarm = await areCachesWarm();
        if (!cachesAlreadyWarm) {
          try {
            await warmCachesOnStartup();
          } catch (error) {
            logWarn("Cache warming failed, continuing", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Fetch Codex system instructions (cached with ETag for efficiency)
        const CODEX_INSTRUCTIONS = await getCodexInstructions();

        const codexFetch = createCodexFetcher({
          getAuth,
          client,
          accountId,
          userConfig,
          codexMode,
          sessionManager,
          codexInstructions: CODEX_INSTRUCTIONS,
          pluginConfig,
        });

        return {
          apiKey: DUMMY_API_KEY,
          baseURL: CODEX_BASE_URL,
          fetch: codexFetch,
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
