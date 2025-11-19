/**
 * OpenCode Codex Prompt Fetcher
 *
 * Fetches and caches codex.txt system prompt from OpenCode's GitHub repository.
 * Uses ETag-based caching to efficiently track updates.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { recordCacheHit, recordCacheMiss } from "../cache/cache-metrics.js";
import { openCodePromptCache } from "../cache/session-cache.js";
import { logError } from "../logger.js";
import { CACHE_FILES, CACHE_TTL_MS } from "../utils/cache-config.js";
import { getOpenCodePath } from "../utils/file-system-utils.js";

const OPENCODE_CODEX_URL =
	"https://raw.githubusercontent.com/sst/opencode/main/packages/opencode/src/session/prompt/codex.txt";

interface OpenCodeCacheMeta {
	etag: string;
	lastFetch?: string; // Legacy field for backwards compatibility
	lastChecked: number; // Timestamp for rate limit protection
}

/**
 * Fetch OpenCode's codex.txt prompt with ETag-based caching
 * Uses HTTP conditional requests to efficiently check for updates
 *
 * Rate limit protection: Only checks GitHub if cache is older than 15 minutes
 * @returns The codex.txt content
 */
export async function getOpenCodeCodexPrompt(): Promise<string> {
	const cacheDir = getOpenCodePath("cache");
	const cacheFilePath = getOpenCodePath("cache", CACHE_FILES.OPENCODE_CODEX);
	const cacheMetaPath = getOpenCodePath("cache", CACHE_FILES.OPENCODE_CODEX_META);
	// Ensure cache directory exists (test expects mkdir to be called)
	await mkdir(cacheDir, { recursive: true });

	// Check session cache first (fastest path)
	const sessionEntry = openCodePromptCache.get("main");
	if (sessionEntry) {
		recordCacheHit("opencodePrompt");
		return sessionEntry.data;
	}
	recordCacheMiss("opencodePrompt");

	// Try to load cached content and metadata
	let cachedContent: string | null = null;
	let cachedMeta: OpenCodeCacheMeta | null = null;

	try {
		cachedContent = await readFile(cacheFilePath, "utf-8");
		const metaContent = await readFile(cacheMetaPath, "utf-8");
		cachedMeta = JSON.parse(metaContent);
	} catch (error) {
		// Cache doesn't exist or is invalid, will fetch fresh
		const err = error as Error;
		logError("Failed to read OpenCode prompt cache", { error: err.message });
	}

	// Rate limit protection: If cache is less than 15 minutes old, use it
	if (cachedMeta?.lastChecked && Date.now() - cachedMeta.lastChecked < CACHE_TTL_MS && cachedContent) {
		// Store in session cache for faster subsequent access
		openCodePromptCache.set("main", { data: cachedContent, etag: cachedMeta.etag || undefined });
		return cachedContent;
	}

	// Fetch from GitHub with conditional request
	const headers: Record<string, string> = {};
	if (cachedMeta?.etag) {
		headers["If-None-Match"] = cachedMeta.etag;
	}

	try {
		const response = await fetch(OPENCODE_CODEX_URL, { headers });

		// 304 Not Modified - cache is still valid
		if (response.status === 304 && cachedContent) {
			// Store in session cache
			openCodePromptCache.set("main", { data: cachedContent, etag: cachedMeta?.etag || undefined });
			return cachedContent;
		}

		// 200 OK - new content available
		if (response.ok) {
			const content = await response.text();
			const etag = response.headers.get("etag") || "";

			// Save to cache with timestamp
			await writeFile(cacheFilePath, content, "utf-8");
			await writeFile(
				cacheMetaPath,
				JSON.stringify(
					{
						etag,
						lastFetch: new Date().toISOString(), // Keep for backwards compat
						lastChecked: Date.now(),
					} satisfies OpenCodeCacheMeta,
					null,
					2,
				),
				"utf-8",
			);

			// Store in session cache
			openCodePromptCache.set("main", { data: content, etag });

			return content;
		}

		// Fallback to cache if available
		if (cachedContent) {
			return cachedContent;
		}

		throw new Error(`Failed to fetch OpenCode codex.txt: ${response.status}`);
	} catch (error) {
		const err = error as Error;
		logError("Failed to fetch OpenCode codex.txt from GitHub", { error: err.message });

		// Network error - fallback to cache
		if (cachedContent) {
			// Store in session cache even for fallback
			openCodePromptCache.set("main", { data: cachedContent, etag: cachedMeta?.etag || undefined });
			return cachedContent;
		}

		throw new Error(`Failed to fetch OpenCode codex.txt and no cache available: ${err.message}`);
	}
}

/**
 * Get first N characters of cached OpenCode prompt for verification
 * @param chars Number of characters to get (default: 50)
 * @returns First N characters or null if not cached
 */
export async function getCachedPromptPrefix(chars = 50): Promise<string | null> {
	try {
		const filePath = getOpenCodePath("cache", CACHE_FILES.OPENCODE_CODEX);
		const content = await readFile(filePath, "utf-8");
		return content.substring(0, chars);
	} catch (error) {
		const err = error as Error;
		logError("Failed to read cached OpenCode prompt prefix", { error: err.message });
		return null;
	}
}
