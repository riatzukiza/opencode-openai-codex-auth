import type { PluginInput } from "@opencode-ai/plugin";
import type { Auth } from "@opencode-ai/sdk";
import { LOG_STAGES } from "../constants.js";
import { logRequest } from "../logger.js";
import { maybeHandleCodexCommand } from "../commands/codex-metrics.js";
import { recordSessionResponseFromHandledResponse } from "../session/response-recorder.js";
import type { SessionManager } from "../session/session-manager.js";
import { finalizeCompactionResponse } from "../compaction/compaction-executor.js";
import type { PluginConfig, UserConfig } from "../types.js";
import {
	createCodexHeaders,
	extractRequestUrl,
	handleErrorResponse,
	handleSuccessResponse,
	refreshAndUpdateToken,
	rewriteUrlForCodex,
	shouldRefreshToken,
	transformRequestForCodex,
} from "./fetch-helpers.js";

export type CodexFetcherDeps = {
	getAuth: () => Promise<Auth>;
	client: PluginInput["client"];
	accountId: string;
	userConfig: UserConfig;
	codexMode: boolean;
	sessionManager: SessionManager;
	codexInstructions: string;
	pluginConfig: PluginConfig;
};

export function createCodexFetcher(deps: CodexFetcherDeps) {
	const { getAuth, client, accountId, userConfig, codexMode, sessionManager, codexInstructions, pluginConfig } = deps;

	return async function codexFetch(input: Request | string | URL, init?: RequestInit): Promise<Response> {
		const currentAuth = await getAuth();
		if (shouldRefreshToken(currentAuth)) {
			const refreshResult = await refreshAndUpdateToken(currentAuth, client);
			if (!refreshResult.success) {
				return refreshResult.response;
			}
		}

		const originalUrl = extractRequestUrl(input);
		const url = rewriteUrlForCodex(originalUrl);
		const transformation = await transformRequestForCodex(
			init,
			url,
			codexInstructions,
			userConfig,
			codexMode,
			sessionManager,
			pluginConfig,
		);

		if (transformation) {
			const commandResponse = maybeHandleCodexCommand(transformation.body, { sessionManager });
			if (commandResponse) {
				return commandResponse;
			}
		}

		const hasTools = transformation?.body.tools !== undefined;
		const requestInit = transformation?.updatedInit ?? init ?? {};
		const sessionContext = transformation?.sessionContext;
		const accessToken = currentAuth.type === "oauth" ? currentAuth.access : "";
		const headers = createCodexHeaders(requestInit, accountId, accessToken, {
			model: transformation?.body.model,
			promptCacheKey: (transformation?.body as Record<string, unknown> | undefined)?.prompt_cache_key as
				| string
				| undefined,
		});

		const response = await fetch(url, { ...requestInit, headers });
		logRequest(LOG_STAGES.RESPONSE, {
			status: response.status,
			ok: response.ok,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
		});

		if (!response.ok) {
			return await handleErrorResponse(response);
		}

		let handledResponse = await handleSuccessResponse(response, hasTools);

		if (transformation?.compactionDecision) {
			handledResponse = await finalizeCompactionResponse({
				response: handledResponse,
				decision: transformation.compactionDecision,
				sessionManager,
				sessionContext,
			});
		}

		await recordSessionResponseFromHandledResponse({
			sessionManager,
			sessionContext,
			handledResponse,
		});

		return handledResponse;
	};
}
