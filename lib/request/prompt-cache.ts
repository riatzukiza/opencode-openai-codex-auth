/* eslint-disable no-param-reassign */
import { createHash, randomUUID } from "node:crypto";
import { logDebug, logInfo, logWarn } from "../logger.js";
import type { RequestBody } from "../types.js";

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	const entries = Object.keys(value as Record<string, unknown>)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);

	return `{${entries.join(",")}}`;
}

type PromptCacheKeySource = "existing" | "metadata" | "generated";

export interface PromptCacheKeyResult {
	key: string;
	source: PromptCacheKeySource;
	sourceKey?: string;
	forkSourceKey?: string;
	hintKeys?: string[];
	unusableKeys?: string[];
	forkHintKeys?: string[];
	forkUnusableKeys?: string[];
	fallbackHash?: string;
}

function extractString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeCacheKeyBase(base: string): string {
	const trimmed = base.trim();
	if (!trimmed) {
		return `cache_${randomUUID()}`;
	}
	const sanitized = trimmed.replace(/\s+/g, "-");
	return sanitized.startsWith("cache_") ? sanitized : `cache_${sanitized}`;
}

function normalizeForkSuffix(forkId: string): string {
	const trimmed = forkId.trim();
	if (!trimmed) return "fork";
	return trimmed.replace(/\s+/g, "-");
}

const PROMPT_CACHE_METADATA_KEYS = [
	"conversation_id",
	"conversationId",
	"thread_id",
	"threadId",
	"session_id",
	"sessionId",
	"chat_id",
	"chatId",
];

const PROMPT_CACHE_FORK_KEYS = [
	"forkId",
	"fork_id",
	"branchId",
	"branch_id",
	"parentConversationId",
	"parent_conversation_id",
];

function derivePromptCacheKeyFromBody(body: RequestBody): {
	base?: string;
	sourceKey?: string;
	hintKeys: string[];
	unusableKeys: string[];
	forkId?: string;
	forkSourceKey?: string;
	forkHintKeys: string[];
	forkUnusableKeys: string[];
} {
	const metadata = body.metadata as Record<string, unknown> | undefined;
	const root = body as Record<string, unknown>;

	const hintKeys: string[] = [];
	const unusableKeys: string[] = [];
	let base: string | undefined;
	let sourceKey: string | undefined;

	for (const key of PROMPT_CACHE_METADATA_KEYS) {
		const raw = metadata?.[key] ?? root[key];
		if (raw !== undefined) {
			hintKeys.push(key);
		}
		const value = extractString(raw);
		if (value) {
			base = value;
			sourceKey = key;
			break;
		}
		if (raw !== undefined) {
			unusableKeys.push(key);
		}
	}

	const forkHintKeys: string[] = [];
	const forkUnusableKeys: string[] = [];
	let forkId: string | undefined;
	let forkSourceKey: string | undefined;

	for (const key of PROMPT_CACHE_FORK_KEYS) {
		const raw = metadata?.[key] ?? root[key];
		if (raw !== undefined) {
			forkHintKeys.push(key);
		}
		const value = extractString(raw);
		if (value) {
			forkId = value;
			forkSourceKey = key;
			break;
		}
		if (raw !== undefined) {
			forkUnusableKeys.push(key);
		}
	}

	return {
		base,
		sourceKey,
		hintKeys,
		unusableKeys,
		forkId,
		forkSourceKey,
		forkHintKeys,
		forkUnusableKeys,
	};
}

function computeFallbackHashForBody(body: RequestBody): string {
	try {
		const inputSlice = Array.isArray(body.input) ? body.input.slice(0, 3) : undefined;
		const seed = stableStringify({
			model: typeof body.model === "string" ? body.model : undefined,
			metadata: body.metadata,
			input: inputSlice,
		});
		return createHash("sha1").update(seed).digest("hex").slice(0, 12);
	} catch {
		const model = typeof body.model === "string" ? body.model : "unknown";
		return createHash("sha1").update(model).digest("hex").slice(0, 12);
	}
}

export function ensurePromptCacheKey(body: RequestBody): PromptCacheKeyResult {
	const hostBody = body as Record<string, unknown>;
	const existingSnake = extractString(hostBody.prompt_cache_key);
	const existingCamel = extractString(hostBody.promptCacheKey);
	const existing = existingSnake || existingCamel;

	if (existing) {
		body.prompt_cache_key = existing;
		if (existingCamel) {
			hostBody.promptCacheKey = existingCamel;
		}
		return { key: existing, source: "existing" };
	}

	const derived = derivePromptCacheKeyFromBody(body);
	if (derived.base) {
		const baseKey = normalizeCacheKeyBase(derived.base);
		const suffix = derived.forkId ? `-fork-${normalizeForkSuffix(derived.forkId)}` : "";
		const finalKey = `${baseKey}${suffix}`;
		body.prompt_cache_key = finalKey;
		return {
			key: finalKey,
			source: "metadata",
			sourceKey: derived.sourceKey,
			forkSourceKey: derived.forkSourceKey,
			hintKeys: derived.hintKeys,
			forkHintKeys: derived.forkHintKeys,
		};
	}

	const fallbackHash = computeFallbackHashForBody(body);
	const generated = `cache_${fallbackHash}`;
	body.prompt_cache_key = generated;
	return {
		key: generated,
		source: "generated",
		hintKeys: derived.hintKeys,
		unusableKeys: derived.unusableKeys,
		forkHintKeys: derived.forkHintKeys,
		forkUnusableKeys: derived.forkUnusableKeys,
		fallbackHash,
	};
}

export function logCacheKeyDecision(cacheKeyResult: PromptCacheKeyResult, isNewSession: boolean): void {
	if (cacheKeyResult.source === "existing") {
		return;
	}

	if (cacheKeyResult.source === "metadata") {
		logDebug("Prompt cache key missing; derived from metadata", {
			promptCacheKey: cacheKeyResult.key,
			sourceKey: cacheKeyResult.sourceKey,
			forkSourceKey: cacheKeyResult.forkSourceKey,
			forkHintKeys: cacheKeyResult.forkHintKeys,
		});
		return;
	}

	const hasHints = Boolean(
		(cacheKeyResult.hintKeys && cacheKeyResult.hintKeys.length > 0) ||
			(cacheKeyResult.forkHintKeys && cacheKeyResult.forkHintKeys.length > 0),
	);
	const message = hasHints
		? "Prompt cache key hints detected but unusable; generated fallback cache key"
		: "Prompt cache key missing; generated fallback cache key";
	const logPayload = {
		promptCacheKey: cacheKeyResult.key,
		fallbackHash: cacheKeyResult.fallbackHash,
		hintKeys: cacheKeyResult.hintKeys,
		unusableKeys: cacheKeyResult.unusableKeys,
		forkHintKeys: cacheKeyResult.forkHintKeys,
		forkUnusableKeys: cacheKeyResult.forkUnusableKeys,
	};
	if (!hasHints && isNewSession) {
		logInfo(message, logPayload);
	} else {
		logWarn(message, logPayload);
	}
}
