import { createHash, randomUUID } from "node:crypto";
import { SESSION_CONFIG } from "../constants.js";
import { logDebug, logWarn } from "../logger.js";
import { PROMPT_CACHE_FORK_KEYS } from "../request/prompt-cache.js";
import type { CodexResponsePayload, InputItem, RequestBody, SessionContext, SessionState } from "../types.js";
import { cloneInputItems, deepClone } from "../utils/clone.js";
import { isAssistantMessage, isUserMessage } from "../utils/input-item-utils.js";

export interface SessionManagerOptions {
	enabled: boolean;
	/**
	 * Optional override to force store=true for cached sessions
	 */
	forceStore?: boolean;
}

// Clone utilities now imported from ../utils/clone.ts

function computeHash(items: InputItem[]): string {
	return createHash("sha1").update(JSON.stringify(items)).digest("hex");
}

function extractLatestUserSlice(items: InputItem[] | undefined): InputItem[] {
	if (!Array.isArray(items) || items.length === 0) {
		return [];
	}

	let lastUserIndex = -1;
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (item && isUserMessage(item)) {
			lastUserIndex = index;
			break;
		}
	}

	if (lastUserIndex < 0) {
		return [];
	}

	const tail: InputItem[] = [];
	for (let index = lastUserIndex; index < items.length; index += 1) {
		const item = items[index];
		if (item && (isUserMessage(item) || isAssistantMessage(item))) {
			tail.push(item);
		} else {
			break;
		}
	}

	return cloneInputItems(tail);
}

function longestSharedPrefixLength(previous: InputItem[], current: InputItem[]): number {
	if (previous.length === 0 || current.length === 0) {
		return 0;
	}

	const limit = Math.min(previous.length, current.length);
	let length = 0;

	for (let i = 0; i < limit; i += 1) {
		if (JSON.stringify(previous[i]) !== JSON.stringify(current[i])) {
			break;
		}
		length += 1;
	}

	return length;
}

function sanitizeCacheKey(candidate: string): string {
	const trimmed = candidate.trim();
	if (trimmed.length === 0) {
		return `cache_${randomUUID()}`;
	}
	return trimmed;
}

function buildPrefixForkIds(
	baseSessionId: string,
	basePromptCacheKey: string,
	prefix: InputItem[],
): { sessionId: string; promptCacheKey: string } {
	const suffix = computeHash(prefix).slice(0, 8);
	return {
		sessionId: `${baseSessionId}::prefix::${suffix}`,
		promptCacheKey: `${basePromptCacheKey}::prefix::${suffix}`,
	};
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

function extractForkIdentifier(body: RequestBody): string | undefined {
	const metadata = body.metadata as Record<string, unknown> | undefined;
	const bodyAny = body as Record<string, unknown>;
	const normalize = (value: unknown): string | undefined => {
		if (typeof value !== "string") {
			return undefined;
		}
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : undefined;
	};

	for (const key of PROMPT_CACHE_FORK_KEYS) {
		const fromMetadata = normalize(metadata?.[key]);
		if (fromMetadata) {
			return fromMetadata;
		}
		const fromBody = normalize(bodyAny[key]);
		if (fromBody) {
			return fromBody;
		}
	}

	return undefined;
}

function buildSessionKey(conversationId: string, forkId: string | undefined): string {
	if (!forkId) {
		return conversationId;
	}
	return `${conversationId}::fork::${forkId}`;
}

// Keep in sync with ensurePromptCacheKey logic in request-transformer.ts so session-managed
// and stateless flows derive identical cache keys.
function buildPromptCacheKey(conversationId: string, forkId: string | undefined): string {
	const sanitized = sanitizeCacheKey(conversationId);
	if (!forkId) {
		return sanitized;
	}
	return `${sanitized}::fork::${forkId}`;
}

export interface SessionMetricsSnapshot {
	enabled: boolean;
	totalSessions: number;
	recentSessions: Array<{
		id: string;
		promptCacheKey: string;
		lastCachedTokens: number | null;
		lastUpdated: number;
	}>;
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

		this.pruneSessions();

		const conversationId = extractConversationId(body);
		const forkId = extractForkIdentifier(body);
		if (!conversationId) {
			// Fall back to host-provided prompt_cache_key if no metadata ID is available
			const hostCacheKey = (body as any).prompt_cache_key || (body as any).promptCacheKey;
			if (hostCacheKey && typeof hostCacheKey === "string") {
				// Use the existing cache key as session identifier to maintain continuity
				const existing = this.sessions.get(hostCacheKey);
				if (existing) {
					return {
						sessionId: hostCacheKey,
						enabled: true,
						preserveIds: true,
						isNew: false,
						state: existing,
					};
				}

				const state: SessionState = {
					id: hostCacheKey,
					promptCacheKey: sanitizeCacheKey(hostCacheKey),
					store: this.options.forceStore ?? false,
					lastInput: [],
					lastPrefixHash: null,
					lastUpdated: Date.now(),
				};

				this.sessions.set(hostCacheKey, state);
				this.pruneSessions();
				return {
					sessionId: hostCacheKey,
					enabled: true,
					preserveIds: true,
					isNew: true,
					state,
				};
			}
			return undefined;
		}

		const sessionKey = buildSessionKey(conversationId, forkId);
		const promptCacheKey = buildPromptCacheKey(conversationId, forkId);

		const existing = this.findExistingSession(sessionKey);
		if (existing) {
			return {
				sessionId: existing.id,
				enabled: true,
				preserveIds: true,
				isNew: false,
				state: existing,
			};
		}

		const state: SessionState = {
			id: sessionKey,
			promptCacheKey,
			store: this.options.forceStore ?? false,
			lastInput: [],
			lastPrefixHash: null,
			lastUpdated: Date.now(),
		};

		this.sessions.set(sessionKey, state);
		this.pruneSessions();

		return {
			sessionId: sessionKey,
			enabled: true,
			preserveIds: true,
			isNew: true,
			state,
		};
	}

	public applyRequest(body: RequestBody, context: SessionContext | undefined): SessionContext | undefined {
		if (!context?.enabled) {
			return context;
		}

		const state = context.state;
		// eslint-disable-next-line no-param-reassign
		body.prompt_cache_key = state.promptCacheKey;
		if (state.store) {
			// eslint-disable-next-line no-param-reassign
			body.store = true;
		}

		const input = cloneInputItems(body.input || []);
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

		const sharedPrefixLength = longestSharedPrefixLength(state.lastInput, input);
		const hasFullPrefixMatch = sharedPrefixLength === state.lastInput.length;

		if (!hasFullPrefixMatch) {
			if (sharedPrefixLength === 0) {
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
				// eslint-disable-next-line no-param-reassign
				body.prompt_cache_key = refreshed.promptCacheKey;
				if (refreshed.store) {
					// eslint-disable-next-line no-param-reassign
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

			const sharedPrefix = input.slice(0, sharedPrefixLength);
			const { sessionId: forkSessionId, promptCacheKey: forkPromptCacheKey } = buildPrefixForkIds(
				state.id,
				state.promptCacheKey,
				sharedPrefix,
			);
			const forkState: SessionState = {
				id: forkSessionId,
				promptCacheKey: forkPromptCacheKey,
				store: state.store,
				lastInput: input,
				lastPrefixHash: inputHash,
				lastUpdated: Date.now(),
				lastCachedTokens: state.lastCachedTokens,
				bridgeInjected: state.bridgeInjected,
				compactionBaseSystem: state.compactionBaseSystem
					? cloneInputItems(state.compactionBaseSystem)
					: undefined,
				compactionSummaryItem: state.compactionSummaryItem
					? deepClone(state.compactionSummaryItem)
					: undefined,
			};
			this.sessions.set(forkSessionId, forkState);
			logWarn("SessionManager: prefix mismatch detected, forking session", {
				sessionId: state.id,
				forkSessionId,
				sharedPrefixLength,
				previousItems: state.lastInput.length,
				incomingItems: input.length,
			});
			// eslint-disable-next-line no-param-reassign
			body.prompt_cache_key = forkPromptCacheKey;
			if (forkState.store) {
				// eslint-disable-next-line no-param-reassign
				body.store = true;
			}
			return {
				sessionId: forkSessionId,
				enabled: true,
				preserveIds: true,
				isNew: true,
				state: forkState,
			};
		}

		state.lastInput = input;
		state.lastPrefixHash = inputHash;
		state.lastUpdated = Date.now();

		return context;
	}

	public applyCompactionSummary(
		context: SessionContext | undefined,
		payload: { baseSystem: InputItem[]; summary: string },
	): void {
		if (!context?.enabled) return;
		const state = context.state;
		state.compactionBaseSystem = cloneInputItems(payload.baseSystem);
		state.compactionSummaryItem = deepClone<InputItem>({
			type: "message",
			role: "user",
			content: payload.summary,
		});
	}

	public applyCompactedHistory(
		body: RequestBody,
		context: SessionContext | undefined,
		opts?: { skip?: boolean },
	): void {
		if (!context?.enabled || opts?.skip) {
			return;
		}
		const baseSystem = context.state.compactionBaseSystem;
		const summary = context.state.compactionSummaryItem;
		if (!baseSystem || !summary) {
			return;
		}
		const tail = extractLatestUserSlice(body.input);
		const merged = [...cloneInputItems(baseSystem), deepClone(summary), ...tail];
		// eslint-disable-next-line no-param-reassign
		body.input = merged;
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

	public getMetrics(limit = 5): SessionMetricsSnapshot {
		const maxEntries = Math.max(0, limit);
		const recentSessions = Array.from(this.sessions.values())
			.sort((a, b) => b.lastUpdated - a.lastUpdated)
			.slice(0, maxEntries)
			.map((state) => ({
				id: state.id,
				promptCacheKey: state.promptCacheKey,
				lastCachedTokens: state.lastCachedTokens ?? null,
				lastUpdated: state.lastUpdated,
			}));

		return {
			enabled: this.options.enabled,
			totalSessions: this.sessions.size,
			recentSessions,
		};
	}

	private findExistingSession(sessionKey: string): SessionState | undefined {
		const direct = this.sessions.get(sessionKey);
		let best = direct;
		const prefixRoot = `${sessionKey}::prefix::`;

		for (const [id, state] of this.sessions.entries()) {
			if (!id.startsWith(prefixRoot)) {
				continue;
			}
			if (!best || state.lastUpdated > best.lastUpdated) {
				best = state;
			}
		}

		return best;
	}

	public pruneIdleSessions(now = Date.now()): void {
		this.pruneSessions(now);
	}

	public resetSession(sessionId: string): void {
		this.resetSessionInternal(sessionId);
	}

	private pruneSessions(now = Date.now()): void {
		if (!this.options.enabled) {
			return;
		}

		for (const [sessionId, state] of this.sessions.entries()) {
			if (now - state.lastUpdated > SESSION_CONFIG.IDLE_TTL_MS) {
				this.sessions.delete(sessionId);
				logDebug("SessionManager: evicted idle session", { sessionId });
			}
		}

		if (this.sessions.size <= SESSION_CONFIG.MAX_ENTRIES) {
			return;
		}

		const victims = Array.from(this.sessions.values()).sort((a, b) => a.lastUpdated - b.lastUpdated);

		for (const victim of victims) {
			if (this.sessions.size <= SESSION_CONFIG.MAX_ENTRIES) {
				break;
			}
			if (!this.sessions.has(victim.id)) {
				continue;
			}
			this.sessions.delete(victim.id);
			logWarn("SessionManager: evicted session to enforce capacity", { sessionId: victim.id });
		}
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
