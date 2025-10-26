import { createHash, randomUUID } from "node:crypto";
import { logDebug, logWarn } from "../logger.js";
import type {
	CodexResponsePayload,
	InputItem,
	RequestBody,
	SessionContext,
	SessionState,
} from "../types.js";

export interface SessionManagerOptions {
	enabled: boolean;
	/**
	 * Optional override to force store=true for cached sessions
	 */
	forceStore?: boolean;
}

type CloneFn = <T>(value: T) => T;

function getCloneFn(): CloneFn {
	const globalClone = (globalThis as unknown as { structuredClone?: CloneFn }).structuredClone;
	if (typeof globalClone === "function") {
		return globalClone;
	}
	return <T>(value: T) => JSON.parse(JSON.stringify(value)) as T;
}

const cloneValue = getCloneFn();

function cloneInput(items: InputItem[] | undefined): InputItem[] {
	if (!Array.isArray(items) || items.length === 0) {
		return [];
	}
	return items.map((item) => cloneValue(item));
}

function computeHash(items: InputItem[]): string {
	return createHash("sha1")
		.update(JSON.stringify(items))
		.digest("hex");
}

function sharesPrefix(previous: InputItem[], current: InputItem[]): boolean {
	if (previous.length === 0) {
		return true;
	}
	if (current.length < previous.length) {
		return false;
	}
	for (let i = 0; i < previous.length; i += 1) {
		if (JSON.stringify(previous[i]) !== JSON.stringify(current[i])) {
			return false;
		}
	}
	return true;
}

function sanitizeCacheKey(candidate: string): string {
	const trimmed = candidate.trim();
	if (trimmed.length === 0) {
		return `cache_${randomUUID()}`;
	}
	return trimmed;
}

function extractConversationId(body: RequestBody): string | undefined {
	const metadata = body.metadata as Record<string, unknown> | undefined;
	const bodyAny = body as Record<string, unknown>;
	const possibleKeys = [
		"conversation_id",
		"conversationId",
		"thread_id",
		"threadId",
		"session_id",
		"sessionId",
		"chat_id",
		"chatId",
	];

	for (const key of possibleKeys) {
		const fromMetadata = metadata?.[key];
		if (typeof fromMetadata === "string" && fromMetadata.length > 0) {
			return fromMetadata;
		}

		const fromBody = bodyAny[key];
		if (typeof fromBody === "string" && fromBody.length > 0) {
			return fromBody;
		}
	}

	return undefined;
}

export class SessionManager {
	private readonly options: SessionManagerOptions;

	private readonly sessions = new Map<string, SessionState>();

	constructor(options: SessionManagerOptions) {
		this.options = options;
	}

	public getContext(body: RequestBody): SessionContext | undefined {
		if (!this.options.enabled) {
			return undefined;
		}

		const conversationId = extractConversationId(body);
		if (!conversationId) {
			return undefined;
		}

		const existing = this.sessions.get(conversationId);
		if (existing) {
			return {
				sessionId: conversationId,
				enabled: true,
				preserveIds: true,
				isNew: false,
				state: existing,
			};
		}

		const state: SessionState = {
			id: conversationId,
			promptCacheKey: sanitizeCacheKey(conversationId),
			store: this.options.forceStore ?? false,
			lastInput: [],
			lastPrefixHash: null,
			lastUpdated: Date.now(),
		};

		this.sessions.set(conversationId, state);

		return {
			sessionId: conversationId,
			enabled: true,
			preserveIds: true,
			isNew: true,
			state,
		};
	}

	public applyRequest(
		body: RequestBody,
		context: SessionContext | undefined,
	): SessionContext | undefined {
		if (!context?.enabled) {
			return context;
		}

		const state = context.state;
		body.prompt_cache_key = state.promptCacheKey;
		if (state.store) {
			body.store = true;
		}

		const input = cloneInput(body.input);
		const inputHash = computeHash(input);

		if (state.lastInput.length === 0) {
			state.lastInput = input;
			state.lastPrefixHash = inputHash;
			state.lastUpdated = Date.now();
			logDebug("SessionManager: initialized session", {
				sessionId: state.id,
				promptCacheKey: state.promptCacheKey,
				inputCount: input.length,
			});
			return context;
		}

		const prefixMatches = sharesPrefix(state.lastInput, input);
		if (!prefixMatches) {
			logWarn("SessionManager: prefix mismatch detected, regenerating cache key", {
				sessionId: state.id,
				previousItems: state.lastInput.length,
				incomingItems: input.length,
			});
			const refreshed = this.resetSessionInternal(state.id, true);
			if (!refreshed) {
				return undefined;
			}
			refreshed.lastInput = input;
			refreshed.lastPrefixHash = inputHash;
			refreshed.lastUpdated = Date.now();
			body.prompt_cache_key = refreshed.promptCacheKey;
			if (refreshed.store) {
				body.store = true;
			}
			return {
				sessionId: refreshed.id,
				enabled: true,
				preserveIds: true,
				isNew: true,
				state: refreshed,
			};
		}

		state.lastInput = input;
		state.lastPrefixHash = inputHash;
		state.lastUpdated = Date.now();

		return context;
	}

	public recordResponse(
		context: SessionContext | undefined,
		payload: CodexResponsePayload | undefined,
	): void {
		if (!context?.enabled || !payload) {
			return;
		}

		const state = context.state;
		const cachedTokens = payload.usage?.cached_tokens;
		if (typeof cachedTokens === "number") {
			state.lastCachedTokens = cachedTokens;
			logDebug("SessionManager: response usage", {
				sessionId: state.id,
				cachedTokens,
			});
		}
		state.lastUpdated = Date.now();
	}

	public resetSession(sessionId: string): void {
		this.resetSessionInternal(sessionId);
}

	private resetSessionInternal(sessionId: string, forceRandomKey = false): SessionState | undefined {
		const existing = this.sessions.get(sessionId);
		const keySeed = existing?.id ?? sessionId;
		const promptCacheKey = forceRandomKey
			? `cache_${randomUUID()}`
			: sanitizeCacheKey(keySeed === sessionId ? sessionId : keySeed);
		const state: SessionState = {
			id: sessionId,
			promptCacheKey,
			store: this.options.forceStore ?? false,
			lastInput: [],
			lastPrefixHash: null,
			lastUpdated: Date.now(),
		};

		this.sessions.set(sessionId, state);
		return state;
	}
}
