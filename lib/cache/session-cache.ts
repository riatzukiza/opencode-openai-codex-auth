/**
 * In-memory session cache for Codex instructions
 * 
 * Provides fast access to frequently used prompts during a plugin session,
 * reducing file I/O and improving response times.
 * 
 * Includes metrics collection for cache performance monitoring.
 */

import { recordCacheEviction } from "./cache-metrics.js";

interface SessionCacheEntry<T> {
	data: T;
	timestamp: number;
	etag?: string;
	tag?: string;
}

interface SessionCache<T> {
	get(key: string): SessionCacheEntry<T> | null;
	set(key: string, entry: Omit<SessionCacheEntry<T>, 'timestamp'>): void;
	clear(): void;
	clean(): void; // Remove expired entries
	getSize(): number; // Get current cache size
}

/**
 * Create a session cache with TTL support
 * @param ttlMs - Time-to-live in milliseconds (default: 15 minutes)
 * @returns Session cache instance
 */
export function createSessionCache<T>(ttlMs = 15 * 60 * 1000): SessionCache<T> {
	const cache = new Map<string, SessionCacheEntry<T>>();

	const get = (key: string): SessionCacheEntry<T> | null => {
		const entry = cache.get(key);
		if (!entry) return null;

		// Check if entry has expired
		if (Date.now() - entry.timestamp > ttlMs) {
			cache.delete(key);
			return null;
		}

		return entry;
	};

	const set = (key: string, entry: Omit<SessionCacheEntry<T>, 'timestamp'>): void => {
		cache.set(key, {
			...entry,
			timestamp: Date.now(),
		});
	};

	const clear = (): void => {
		cache.clear();
	};

	const clean = (): void => {
		const now = Date.now();
		for (const [key, entry] of cache.entries()) {
			if (now - entry.timestamp > ttlMs) {
				cache.delete(key);
			}
		}
	};

	const getSize = (): number => {
		return cache.size;
	};

	return { get, set, clear, clean, getSize };
}

// Global session caches
export const codexInstructionsCache = createSessionCache<string>(15 * 60 * 1000); // 15 minutes
export const openCodePromptCache = createSessionCache<string>(15 * 60 * 1000); // 15 minutes

/**
 * Generate cache key for Codex instructions
 * @param etag - ETag from GitHub response
 * @param tag - Release tag
 * @returns Cache key string
 */
export function getCodexCacheKey(etag?: string, tag?: string): string {
	return `codex:${etag || 'no-etag'}:${tag || 'no-tag'}`;
}

/**
 * Generate cache key for OpenCode prompt
 * @param etag - ETag from GitHub response
 * @returns Cache key string
 */
export function getOpenCodeCacheKey(etag?: string): string {
	return `opencode:${etag || 'no-etag'}`;
}

/**
 * Clean up expired cache entries
 * Call this periodically to prevent memory leaks
 */
export function cleanupExpiredCaches(): void {
	const beforeCodex = codexInstructionsCache.getSize();
	codexInstructionsCache.clean();
	const afterCodex = codexInstructionsCache.getSize();
	const evictedCodex = Math.max(0, beforeCodex - afterCodex);
	for (let i = 0; i < evictedCodex; i++) recordCacheEviction('codexInstructions');

	const beforeOpenCode = openCodePromptCache.getSize();
	openCodePromptCache.clean();
	const afterOpenCode = openCodePromptCache.getSize();
	const evictedOpenCode = Math.max(0, beforeOpenCode - afterOpenCode);
	for (let i = 0; i < evictedOpenCode; i++) recordCacheEviction('opencodePrompt');
}
