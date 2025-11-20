/**
 * Cache warming utilities
 *
 * Pre-populates caches during plugin initialization to improve
 * first-request performance and avoid cold start delays.
 */

import { logDebug, logWarn } from "../logger.js";
import { getCodexInstructions } from "../prompts/codex.js";
import { getOpenCodeCodexPrompt } from "../prompts/opencode-codex.js";
import { cleanupExpiredCaches, codexInstructionsCache, openCodePromptCache } from "./session-cache.js";

/**
 * Cache warming result with metadata
 */
export interface CacheWarmResult {
	success: boolean;
	codexInstructionsWarmed: boolean;
	opencodePromptWarmed: boolean;
	duration: number;
	error?: string;
}

/**
 * Warm up essential caches during plugin startup
 * This improves first-request performance significantly
 *
 * @returns Promise<CacheWarmResult> - Warming results with timing
 */
let lastCacheWarmResult: CacheWarmResult | undefined;

export async function warmCachesOnStartup(): Promise<CacheWarmResult> {
	const startTime = Date.now();
	const result: CacheWarmResult = {
		success: false,
		codexInstructionsWarmed: false,
		opencodePromptWarmed: false,
		duration: 0,
	};

	logDebug("Starting cache warming on startup");

	// Clean up expired entries first to prevent memory buildup
	try {
		cleanupExpiredCaches();
		logDebug("Cleaned up expired cache entries before warming");
	} catch (error) {
		logWarn(`Failed to cleanup expired caches: ${error instanceof Error ? error.message : String(error)}`);
	}

	let firstError: Error | undefined;

	try {
		// Warm Codex instructions cache (most critical)
		try {
			await getCodexInstructions();
			result.codexInstructionsWarmed = true;
			logDebug("Codex instructions cache warmed successfully");
		} catch (error) {
			if (!firstError) firstError = error instanceof Error ? error : new Error(String(error));
			logWarn(
				`Failed to warm Codex instructions cache: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Warm OpenCode prompt cache (used for filtering)
		try {
			await getOpenCodeCodexPrompt();
			result.opencodePromptWarmed = true;
			logDebug("OpenCode prompt cache warmed successfully");
		} catch (error) {
			if (!firstError) firstError = error instanceof Error ? error : new Error(String(error));
			logWarn(
				`Failed to warm OpenCode prompt cache: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Consider successful if at least one cache warmed
		result.success = result.codexInstructionsWarmed || result.opencodePromptWarmed;

		// Set error to first encountered error if complete failure
		if (!result.success && firstError) {
			result.error = firstError.message;
		}
	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
		logWarn(`Cache warming failed: ${result.error}`);
	} finally {
		result.duration = Date.now() - startTime;

		if (result.success) {
			logDebug(
				`Cache warming completed in ${result.duration}ms (Codex: ${result.codexInstructionsWarmed}, OpenCode: ${result.opencodePromptWarmed})`,
			);
		} else {
			logWarn(`Cache warming failed after ${result.duration}ms`);
		}
	}

	lastCacheWarmResult = { ...result };
	return result;
}

/**
 * Check if caches are already warm (have valid entries)
 * Used to avoid redundant warming operations
 *
 * This function checks session cache directly without triggering network requests,
 * avoiding race conditions where cache warming might be called unnecessarily.
 *
 * @returns Promise<boolean> - True if caches appear to be warm
 */
export async function areCachesWarm(): Promise<boolean> {
	try {
		// Check session cache directly without triggering network requests
		// This prevents race conditions where full functions might fetch from network
		const codexEntry = codexInstructionsCache.get("latest");
		const opencodeEntry = openCodePromptCache.get("main");

		// If both caches have valid entries, they are warm
		return !!(codexEntry && opencodeEntry);
	} catch {
		// Any error suggests caches are not warm
		return false;
	}
}

/**
 * Get cache warming statistics for monitoring
 *
 * @returns Promise<object> - Cache status information
 */
export interface CacheWarmSnapshot {
	codexInstructions: boolean;
	opencodePrompt: boolean;
}

export function getCacheWarmSnapshot(): CacheWarmSnapshot {
	return {
		codexInstructions: Boolean(codexInstructionsCache.get("latest")),
		opencodePrompt: Boolean(openCodePromptCache.get("main")),
	};
}

export async function getCacheWarmingStats(): Promise<{
	codexInstructionsCached: boolean;
	opencodePromptCached: boolean;
	lastWarmingResult?: CacheWarmResult;
}> {
	const snapshot = getCacheWarmSnapshot();
	return {
		codexInstructionsCached: snapshot.codexInstructions,
		opencodePromptCached: snapshot.opencodePrompt,
		lastWarmingResult: lastCacheWarmResult,
	};
}
