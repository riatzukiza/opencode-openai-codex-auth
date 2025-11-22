/**
 * Helper functions for the custom fetch implementation
 * These functions break down the complex fetch logic into manageable, testable units
 */

import type { Auth, OpencodeClient } from "@opencode-ai/sdk";
import { refreshAccessToken } from "../auth/auth.js";
import {
	ERROR_MESSAGES,
	HTTP_STATUS,
	LOG_STAGES,
	OPENAI_HEADER_VALUES,
	OPENAI_HEADERS,
	URL_PATHS,
} from "../constants.js";
import { logError, logRequest } from "../logger.js";
import type { SessionManager } from "../session/session-manager.js";
import type { PluginConfig, RequestBody, SessionContext, UserConfig } from "../types.js";
import { transformRequestBody } from "./request-transformer.js";
import { convertSseToJson, ensureContentType } from "./response-handler.js";

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
): Promise<{ success: true; auth: Auth } | { success: false; response: Response }> {
	const refreshToken = currentAuth.type === "oauth" ? currentAuth.refresh : "";
	const refreshResult = await refreshAccessToken(refreshToken);

	if (refreshResult.type === "failed") {
		logError(ERROR_MESSAGES.TOKEN_REFRESH_FAILED);
		return {
			success: false,
			response: new Response(JSON.stringify({ error: "Token refresh failed" }), {
				status: HTTP_STATUS.UNAUTHORIZED,
			}),
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

	// Build updated auth snapshot for callers (avoid mutating the parameter)
	let updatedAuth: Auth = currentAuth;
	if (currentAuth.type === "oauth") {
		updatedAuth = {
			...currentAuth,
			access: refreshResult.access,
			refresh: refreshResult.refresh,
			expires: refreshResult.expires,
		};
	}

	return { success: true, auth: updatedAuth };
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

/**
 * Rewrites OpenAI API URLs to Codex backend URLs
 * @param url - Original URL
 * @returns Rewritten URL for Codex backend
 */
export function rewriteUrlForCodex(url: string): string {
	return url.replace(URL_PATHS.RESPONSES, URL_PATHS.CODEX_RESPONSES);
}

function applyPromptCacheKey(body: RequestBody, sessionContext?: SessionContext): RequestBody {
	const promptCacheKey = sessionContext?.state?.promptCacheKey;
	if (!promptCacheKey) return body;

	const hostProvided = (body as any).prompt_cache_key || (body as any).promptCacheKey;
	if (hostProvided) {
		return body;
	}

	return { ...(body as any), prompt_cache_key: promptCacheKey } as RequestBody;
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
	  }
	| undefined
> {
	if (!init?.body) return undefined;

	try {
		const body = JSON.parse(init.body as string) as RequestBody;
		const originalModel = body.model;
		const sessionContext = sessionManager?.getContext(body);

		const bodyWithCacheKey = applyPromptCacheKey(body, sessionContext);

		logRequest(LOG_STAGES.BEFORE_TRANSFORM, {
			url,
			originalModel,
			model: bodyWithCacheKey.model,
			hasTools: !!bodyWithCacheKey.tools,
			hasInput: !!bodyWithCacheKey.input,
			inputLength: bodyWithCacheKey.input?.length,
			codexMode,
			body: bodyWithCacheKey as unknown as Record<string, unknown>,
		});

		const transformResult = await transformRequestBody(
			bodyWithCacheKey,
			codexInstructions,
			userConfig,
			codexMode,
			{
				preserveIds: sessionContext?.preserveIds,
				appendEnvContext: pluginConfig?.appendEnvContext ?? process.env.CODEX_APPEND_ENV_CONTEXT === "1",
			},

			sessionContext,
		);
		const appliedContext =
			sessionManager?.applyRequest(transformResult.body, sessionContext) ?? sessionContext;

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

		const updatedInit: RequestInit = {
			...init,
			body: JSON.stringify(transformResult.body),
		};

		return {
			body: transformResult.body,
			updatedInit,
			sessionContext: appliedContext,
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

function safeParseErrorJson(raw: string): any | null {
	try {
		return JSON.parse(raw) as any;
	} catch {
		return null;
	}
}

type RateLimitBuckets = {
	primary: { used_percent?: number; window_minutes?: number; resets_at?: number };
	secondary: { used_percent?: number; window_minutes?: number; resets_at?: number };
};

function parseRateLimits(headers: Headers): RateLimitBuckets | undefined {
	const primary = {
		used_percent: toNumber(headers.get("x-codex-primary-used-percent")),
		window_minutes: toInt(headers.get("x-codex-primary-window-minutes")),
		resets_at: toInt(headers.get("x-codex-primary-reset-at")),
	};
	const secondary = {
		used_percent: toNumber(headers.get("x-codex-secondary-used-percent")),
		window_minutes: toInt(headers.get("x-codex-secondary-window-minutes")),
		resets_at: toInt(headers.get("x-codex-secondary-reset-at")),
	};
	const hasRateLimits = primary.used_percent !== undefined || secondary.used_percent !== undefined;

	return hasRateLimits ? { primary, secondary } : undefined;
}

function isUsageLimitError(code: unknown): boolean {
	return /usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(String(code ?? ""));
}

function buildUsageFriendlyMessage(
	err: Record<string, unknown>,
	rateLimits: RateLimitBuckets | undefined,
): string | undefined {
	const parsedReset =
		typeof err.resets_at === "number"
			? err.resets_at
			: err.resets_at != null
				? Number(err.resets_at)
				: undefined;
	const resetSource = Number.isFinite(parsedReset)
		? (parsedReset as number)
		: (rateLimits?.primary.resets_at ?? rateLimits?.secondary.resets_at);
	const mins =
		typeof resetSource === "number"
			? Math.max(0, Math.round((resetSource * 1000 - Date.now()) / 60000))
			: undefined;
	const plan = err.plan_type ? ` (${String(err.plan_type).toLowerCase()} plan)` : "";
	const when = mins !== undefined ? ` Try again in ~${mins} min.` : "";
	return `You have hit your ChatGPT usage limit${plan}.${when}`.trim();
}

function enrichErrorBody(raw: string, response: Response): { body: string; isJson: boolean } {
	const parsed = safeParseErrorJson(raw);
	if (!parsed) {
		return { body: raw, isJson: false };
	}

	const err = (parsed as any)?.error ?? {};
	const rate_limits = parseRateLimits(response.headers);
	const usageLimit = isUsageLimitError(err.code ?? err.type);
	const friendly_message = usageLimit ? buildUsageFriendlyMessage(err, rate_limits) : undefined;
	const message = usageLimit
		? (err.message ?? friendly_message)
		: (err.message ??
			(parsed as any)?.error?.message ??
			(typeof parsed === "string" ? parsed : undefined) ??
			`Request failed with status ${response.status}.`);

	const enhanced = {
		error: {
			...err,
			message,
			friendly_message,
			rate_limits,
			status: response.status,
		},
	};

	return { body: JSON.stringify(enhanced), isJson: true };
}

/**
 * Enriches a Codex API error Response with structured error details and rate-limit metadata.
 *
 * @param response - The original error Response from a Codex API request
 * @returns A Response with the same status and statusText whose body is either the original raw body or a JSON object containing an `error` object with `message`, optional `friendly_message`, optional `rate_limits`, and `status`. When the body is enriched, the response `Content-Type` is set to `application/json; charset=utf-8`.
 */
export async function handleErrorResponse(response: Response): Promise<Response> {
	const raw = await response.text();
	const { body: enriched, isJson } = enrichErrorBody(raw, response);

	logRequest(LOG_STAGES.ERROR_RESPONSE, {
		status: response.status,
		error: enriched,
	});

	logError(`${response.status} error`, { body: enriched });

	const headers = new Headers(response.headers);
	if (isJson) {
		headers.set("content-type", "application/json; charset=utf-8");
	}
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
export async function handleSuccessResponse(response: Response, hasTools: boolean): Promise<Response> {
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
