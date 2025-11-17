/**
 * Helper functions for the custom fetch implementation
 * These functions break down the complex fetch logic into manageable, testable units
 */

import type { Auth } from "@opencode-ai/sdk";
import type { OpencodeClient } from "@opencode-ai/sdk";
import { refreshAccessToken } from "../auth/auth.js";
import { logRequest, logError } from "../logger.js";
import { transformRequestBody } from "./request-transformer.js";
import { convertSseToJson, ensureContentType } from "./response-handler.js";
import type { UserConfig, RequestBody, SessionContext, PluginConfig, InputItem } from "../types.js";
import { SessionManager } from "../session/session-manager.js";
import { detectCompactionCommand } from "../compaction/codex-compaction.js";
import type { CompactionDecision } from "../compaction/compaction-executor.js";
import {
	HTTP_STATUS,
	OPENAI_HEADERS,
	OPENAI_HEADER_VALUES,
	URL_PATHS,
	ERROR_MESSAGES,
	LOG_STAGES,
} from "../constants.js";

/**
 * Determines if the current auth token needs to be refreshed
 * @param auth - Current authentication state
 * @returns True if token is expired or invalid
 */
export function shouldRefreshToken(auth: Auth): boolean {
	return auth.type !== "oauth" || !auth.access || auth.expires < Date.now();
}

/**
 * Refreshes the OAuth token and updates stored credentials
 * @param currentAuth - Current auth state
 * @param client - Opencode client for updating stored credentials
 * @returns Updated auth or error response
 */
export async function refreshAndUpdateToken(
	currentAuth: Auth,
	client: OpencodeClient,
): Promise<
	{ success: true; auth: Auth } | { success: false; response: Response }
> {
	const refreshToken = currentAuth.type === "oauth" ? currentAuth.refresh : "";
	const refreshResult = await refreshAccessToken(refreshToken);

	if (refreshResult.type === "failed") {
		logError(ERROR_MESSAGES.TOKEN_REFRESH_FAILED);
		return {
			success: false,
			response: new Response(
				JSON.stringify({ error: "Token refresh failed" }),
				{ status: HTTP_STATUS.UNAUTHORIZED },
			),
		};
	}

	// Update stored credentials
	await client.auth.set({
		path: { id: "openai" },
		body: {
			type: "oauth",
			access: refreshResult.access,
			refresh: refreshResult.refresh,
			expires: refreshResult.expires,
		},
	});

	// Update current auth reference if it's OAuth type
	if (currentAuth.type === "oauth") {
		currentAuth.access = refreshResult.access;
		currentAuth.refresh = refreshResult.refresh;
		currentAuth.expires = refreshResult.expires;
	}

	return { success: true, auth: currentAuth };
}

/**
 * Extracts URL string from various request input types
 * @param input - Request input (string, URL, or Request object)
 * @returns URL string
 */
export function extractRequestUrl(input: Request | string | URL): string {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	return input.url;
}

function cloneInput(items: InputItem[] | undefined): InputItem[] {
	if (!Array.isArray(items) || items.length === 0) {
		return [];
	}
	const globalClone = (globalThis as { structuredClone?: <T>(value: T) => T }).structuredClone;
	if (typeof globalClone === "function") {
		return items.map((item) => globalClone(item));
	}
	return items.map((item) => JSON.parse(JSON.stringify(item)) as InputItem);
}

/**
 * Rewrites OpenAI API URLs to Codex backend URLs
 * @param url - Original URL
 * @returns Rewritten URL for Codex backend
 */
export function rewriteUrlForCodex(url: string): string {
	return url.replace(URL_PATHS.RESPONSES, URL_PATHS.CODEX_RESPONSES);
}

/**
 * Transforms request body and logs the transformation
 * @param init - Request init options
 * @param url - Request URL
 * @param codexInstructions - Codex system instructions
 * @param userConfig - User configuration
 * @param codexMode - Enable CODEX_MODE (bridge prompt instead of tool remap)
 * @returns Transformed body and updated init, or undefined if no body
 */
export async function transformRequestForCodex(
	init: RequestInit | undefined,
	url: string,
	codexInstructions: string,
	userConfig: UserConfig,
	codexMode = true,
	sessionManager?: SessionManager,
	pluginConfig?: PluginConfig,
): Promise<
	| {
			body: RequestBody;
			updatedInit: RequestInit;
			sessionContext?: SessionContext;
			compactionDecision?: CompactionDecision;
	  }
	| undefined
> {
	if (!init?.body) return undefined;

	try {
		const body = JSON.parse(init.body as string) as RequestBody;
		const originalModel = body.model;
		const originalInput = cloneInput(body.input);
		const compactionEnabled = pluginConfig?.enableCodexCompaction !== false;
		const compactionSettings = {
			enabled: compactionEnabled,
			autoLimitTokens: pluginConfig?.autoCompactTokenLimit,
			autoMinMessages: pluginConfig?.autoCompactMinMessages ?? 8,
		};
		const manualCommand = compactionEnabled ? detectCompactionCommand(originalInput) : null;

		const sessionContext = sessionManager?.getContext(body);
		if (!manualCommand) {
			sessionManager?.applyCompactedHistory?.(body, sessionContext);
		}

		// Log original request
		logRequest(LOG_STAGES.BEFORE_TRANSFORM, {
			url,
			originalModel,
			model: body.model,
			hasTools: !!body.tools,
			hasInput: !!body.input,
			inputLength: body.input?.length,
			codexMode,
			body: body as unknown as Record<string, unknown>,
		});

		// Transform request body
		const transformResult = await transformRequestBody(
			body,
			codexInstructions,
			userConfig,
			codexMode,
			{
				preserveIds: sessionContext?.preserveIds,
				compaction: {
					settings: compactionSettings,
					commandText: manualCommand,
					originalInput,
				},
			},
		);
		const appliedContext = sessionManager?.applyRequest(transformResult.body, sessionContext) ?? sessionContext;

		// Log transformed request
		logRequest(LOG_STAGES.AFTER_TRANSFORM, {
			url,
			originalModel,
			normalizedModel: transformResult.body.model,
			hasTools: !!transformResult.body.tools,
			hasInput: !!transformResult.body.input,
			inputLength: transformResult.body.input?.length,
			reasoning: transformResult.body.reasoning as unknown,
			textVerbosity: transformResult.body.text?.verbosity,
			include: transformResult.body.include,
			body: transformResult.body as unknown as Record<string, unknown>,
		});

		return {
			body: transformResult.body,
			updatedInit: { ...init, body: JSON.stringify(transformResult.body) },
			sessionContext: appliedContext,
			compactionDecision: transformResult.compactionDecision,
		};
	} catch (e) {
		logError(ERROR_MESSAGES.REQUEST_PARSE_ERROR, {
			error: e instanceof Error ? e.message : String(e),
		});
		return undefined;
	}
}

/**
 * Creates headers for Codex API requests
 * @param init - Request init options
 * @param accountId - ChatGPT account ID
 * @param accessToken - OAuth access token
 * @returns Headers object with all required Codex headers
 */
export function createCodexHeaders(
	init: RequestInit | undefined,
	accountId: string,
	accessToken: string,
	opts?: { model?: string; promptCacheKey?: string },
): Headers {
	const headers = new Headers(init?.headers ?? {});
	headers.delete("x-api-key"); // Remove any existing API key
	headers.set("Authorization", `Bearer ${accessToken}`);
	headers.set(OPENAI_HEADERS.ACCOUNT_ID, accountId);
	headers.set(OPENAI_HEADERS.BETA, OPENAI_HEADER_VALUES.BETA_RESPONSES);
	headers.set(OPENAI_HEADERS.ORIGINATOR, OPENAI_HEADER_VALUES.ORIGINATOR_CODEX);

	const cacheKey = opts?.promptCacheKey;
	if (cacheKey) {
		headers.set(OPENAI_HEADERS.CONVERSATION_ID, cacheKey);
		headers.set(OPENAI_HEADERS.SESSION_ID, cacheKey);
	} else {
		headers.delete(OPENAI_HEADERS.CONVERSATION_ID);
		headers.delete(OPENAI_HEADERS.SESSION_ID);
	}
	headers.set("accept", "text/event-stream");
	return headers;
}

/**
 * Handles error responses from the Codex API
 * @param response - Error response from API
 * @returns Response with error details
 */
export async function handleErrorResponse(response: Response): Promise<Response> {
	const raw = await response.text();

	let enriched = raw;
	try {
		const parsed = JSON.parse(raw) as any;
		const err = parsed?.error ?? {};

		// Parse Codex rate-limit headers if present
		const h = response.headers;
		const primary = {
			used_percent: toNumber(h.get("x-codex-primary-used-percent")),
			window_minutes: toInt(h.get("x-codex-primary-window-minutes")),
			resets_at: toInt(h.get("x-codex-primary-reset-at")),
		};
		const secondary = {
			used_percent: toNumber(h.get("x-codex-secondary-used-percent")),
			window_minutes: toInt(h.get("x-codex-secondary-window-minutes")),
			resets_at: toInt(h.get("x-codex-secondary-reset-at")),
		};
		const rate_limits =
			primary.used_percent !== undefined || secondary.used_percent !== undefined
				? { primary, secondary }
				: undefined;

		// Determine if this is a genuine usage limit error
		const code = (err.code ?? err.type ?? "").toString();
		const isUsageLimitError = /usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code);

		let friendly_message: string | undefined;
		let message: string;

		if (isUsageLimitError) {
			const resetsAt = err.resets_at ?? primary.resets_at ?? secondary.resets_at;
			const mins = resetsAt ? Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60000)) : undefined;
			const plan = err.plan_type ? ` (${String(err.plan_type).toLowerCase()} plan)` : "";
			const when = mins !== undefined ? ` Try again in ~${mins} min.` : "";
			friendly_message = `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
			message = err.message ?? friendly_message;
		} else {
			// Preserve original error message for non-usage-limit errors
			message = err.message
				?? parsed?.error?.message
				?? (typeof parsed === "string" ? parsed : undefined)
				?? `Request failed with status ${response.status}.`;
		}

		const enhanced = {
			error: {
				...err,
				message,
				friendly_message,
				rate_limits,
				status: response.status,
			},
		};
		enriched = JSON.stringify(enhanced);
	} catch {
		// Raw body not JSON; leave unchanged
		enriched = raw;
	}

	logRequest(LOG_STAGES.ERROR_RESPONSE, {
		status: response.status,
		error: enriched,
	});

	logError(`${response.status} error`, { body: enriched });

	const headers = new Headers(response.headers);
	headers.set("content-type", "application/json; charset=utf-8");
	return new Response(enriched, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

/**
 * Handles successful responses from the Codex API
 * Converts SSE to JSON for non-tool requests
 * @param response - Success response from API
 * @param hasTools - Whether the request included tools
 * @returns Processed response (SSE→JSON for non-tool, stream for tool requests)
 */
export async function handleSuccessResponse(
	response: Response,
	hasTools: boolean,
): Promise<Response> {
	const responseHeaders = ensureContentType(response.headers);

	// For non-tool requests (compact/summarize), convert streaming SSE to JSON
	// generateText() expects a non-streaming JSON response, not SSE
	if (!hasTools) {
		return await convertSseToJson(response, responseHeaders);
	}

	// For tool requests, return stream as-is (streamText handles SSE)
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: responseHeaders,
	});
}

function toNumber(v: string | null): number | undefined {
	if (v == null) return undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}
function toInt(v: string | null): number | undefined {
	if (v == null) return undefined;
	const n = parseInt(v, 10);
	return Number.isFinite(n) ? n : undefined;
}
