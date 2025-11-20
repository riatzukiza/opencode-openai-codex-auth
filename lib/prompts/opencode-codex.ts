/**
 * OpenCode Codex Prompt Fetcher
 *
 * Fetches and caches codex.txt system prompt from OpenCode's GitHub repository.
 * Uses ETag-based caching to efficiently track updates.
 * Handles cache conflicts when switching between different Codex plugins.
 */

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { recordCacheHit, recordCacheMiss } from "../cache/cache-metrics.js";
import { openCodePromptCache } from "../cache/session-cache.js";
import { logError, logWarn, logInfo } from "../logger.js";
import { CACHE_FILES, CACHE_TTL_MS, LEGACY_CACHE_FILES, PLUGIN_PREFIX } from "../utils/cache-config.js";
import { getOpenCodePath } from "../utils/file-system-utils.js";

const OPENCODE_CODEX_URLS = [
	"https://raw.githubusercontent.com/sst/opencode/dev/packages/opencode/src/session/prompt/codex.txt",
	"https://raw.githubusercontent.com/sst/opencode/main/packages/opencode/src/session/prompt/codex.txt",
];

interface OpenCodeCacheMeta {
	etag: string;
	sourceUrl?: string;
	lastFetch?: string; // Legacy field for backwards compatibility
	lastChecked: number; // Timestamp for rate limit protection
	url?: string; // Track source URL for validation
}

/**
 * Check if legacy cache files exist and migrate them
 * @param cacheDir - Cache directory path
 */
async function migrateLegacyCache(): Promise<void> {
	const legacyCachePath = getOpenCodePath("cache", LEGACY_CACHE_FILES.OPENCODE_CODEX);
	const legacyMetaPath = getOpenCodePath("cache", LEGACY_CACHE_FILES.OPENCODE_CODEX_META);

	try {
		// Check if legacy files exist
		const legacyContent = await readFile(legacyCachePath, "utf-8");
		const legacyMeta = await readFile(legacyMetaPath, "utf-8");

		// Legacy files found, migrate to our plugin-specific files
		logWarn("Detected cache files from different plugin. Migrating to @openhax/codex cache...", {
			legacyFiles: [LEGACY_CACHE_FILES.OPENCODE_CODEX, LEGACY_CACHE_FILES.OPENCODE_CODEX_META],
		});

		const newCachePath = getOpenCodePath("cache", CACHE_FILES.OPENCODE_CODEX);
		const newMetaPath = getOpenCodePath("cache", CACHE_FILES.OPENCODE_CODEX_META);

		// Copy to new locations
		await writeFile(newCachePath, legacyContent, "utf-8");
		await writeFile(newMetaPath, legacyMeta, "utf-8");

		// Remove legacy files to prevent future conflicts
		await rename(legacyCachePath, `${legacyCachePath}.backup.${Date.now()}`);
		await rename(legacyMetaPath, `${legacyMetaPath}.backup.${Date.now()}`);

		logInfo("Cache migration completed successfully. Using isolated @openhax/codex cache.");
	} catch (error) {
		// No legacy files or migration failed - continue normally
		const err = error as Error & { code?: string };
		if (err.code !== "ENOENT") {
			logWarn("Cache migration failed, will continue with fresh cache", { error: err.message });
		}
	}
}

/**
 * Validate cache format and detect conflicts
 * @param cachedMeta - Cache metadata to validate
 * @returns True if cache appears to be from our plugin
 */
function validateCacheFormat(cachedMeta: OpenCodeCacheMeta | null): boolean {
	if (!cachedMeta) return false;

	// Check if cache has expected structure for our plugin
	// Legacy caches might have different URL or missing fields
	const hasValidStructure = Boolean(
		cachedMeta.etag &&
			typeof cachedMeta.lastChecked === "number" &&
			(cachedMeta.url === undefined || cachedMeta.url?.includes("sst/opencode")),
	);

	return hasValidStructure;
}

/**
 * Fetch OpenCode's codex.txt prompt with ETag-based caching and conflict resolution
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

	// Check for and migrate legacy cache files only when session cache misses
	await migrateLegacyCache();

	// Try to load cached content and metadata
	let cachedContent: string | null = null;
	let cachedMeta: OpenCodeCacheMeta | null = null;

	try {
		cachedContent = await readFile(cacheFilePath, "utf-8");
		const metaContent = await readFile(cacheMetaPath, "utf-8");
		cachedMeta = JSON.parse(metaContent);
	} catch (error) {
		// Cache doesn't exist or is invalid, will fetch fresh
		const err = error as Error & { code?: string };
		if (err.code !== "ENOENT") {
			logError("Failed to read OpenCode prompt cache", { error: err.message });
		}
	}

	// Validate cache format and handle conflicts
	if (cachedMeta && !validateCacheFormat(cachedMeta)) {
		logWarn("Detected incompatible cache format. Creating fresh cache for @openhax/codex...", {
			cacheSource: cachedMeta.url || "unknown",
			pluginPrefix: PLUGIN_PREFIX,
		});

		// Reset cache variables to force fresh fetch
		cachedContent = null;
		cachedMeta = null;
	}

	// Rate limit protection: If cache is less than 15 minutes old and valid, use it
	if (cachedMeta?.lastChecked && Date.now() - cachedMeta.lastChecked < CACHE_TTL_MS && cachedContent) {
		// Store in session cache for faster subsequent access
		openCodePromptCache.set("main", { data: cachedContent, etag: cachedMeta?.etag || undefined });
		return cachedContent;
	}

	// Fetch from GitHub with conditional requests and fallbacks
	let lastError: Error | undefined;
	for (const url of OPENCODE_CODEX_URLS) {
		const headers: Record<string, string> = {};
		if (cachedMeta?.etag && (!cachedMeta.sourceUrl || cachedMeta.sourceUrl === url)) {
			headers["If-None-Match"] = cachedMeta.etag;
		}

		try {
			const response = await fetch(url, { headers });

			// 304 Not Modified - cache is still valid
			if (response.status === 304 && cachedContent) {
				const updatedMeta: OpenCodeCacheMeta = {
					etag: cachedMeta?.etag || "",
					sourceUrl: cachedMeta?.sourceUrl || url,
					lastFetch: cachedMeta?.lastFetch,
					lastChecked: Date.now(),
					url: cachedMeta?.url,
				};
				await writeFile(cacheMetaPath, JSON.stringify(updatedMeta, null, 2), "utf-8");

				openCodePromptCache.set("main", {
					data: cachedContent,
					etag: updatedMeta.etag || undefined,
				});
				return cachedContent;
			}

			// 200 OK - new content available
			if (response.ok) {
				const content = await response.text();
				const etag = response.headers.get("etag") || "";

				await writeFile(cacheFilePath, content, "utf-8");
				await writeFile(
					cacheMetaPath,
					JSON.stringify(
						{
							etag,
							sourceUrl: url,
							lastFetch: new Date().toISOString(), // Keep for backwards compat
							lastChecked: Date.now(),
						} satisfies OpenCodeCacheMeta,
						null,
						2,
					),
					"utf-8",
				);

				openCodePromptCache.set("main", { data: content, etag });

				return content;
			}

			lastError = new Error(`HTTP ${response.status} from ${url}`);
		} catch (error) {
			const err = error as Error;
			lastError = new Error(`Failed to fetch ${url}: ${err.message}`);
		}
	}

	if (lastError) {
		logError("Failed to fetch OpenCode codex.txt from GitHub", { error: lastError.message });
	}

	if (cachedContent) {
		const updatedMeta: OpenCodeCacheMeta = {
			etag: cachedMeta?.etag || "",
			sourceUrl: cachedMeta?.sourceUrl,
			lastFetch: cachedMeta?.lastFetch,
			lastChecked: Date.now(),
			url: cachedMeta?.url,
		};
		await writeFile(cacheMetaPath, JSON.stringify(updatedMeta, null, 2), "utf-8");

		openCodePromptCache.set("main", { data: cachedContent, etag: updatedMeta.etag || undefined });
		return cachedContent;
	}

	throw new Error(
		`Failed to fetch OpenCode codex.txt and no cache available: ${lastError?.message || "unknown error"}`,
	);
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
		const err = error as Error & { code?: string };
		if (err.code !== "ENOENT") {
			logError("Failed to read cached OpenCode prompt prefix", { error: err.message });
		}
		return null;
	}
}
