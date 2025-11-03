/**
 * Cache warming utilities
 * 
 * Pre-populates caches during plugin initialization to improve
 * first-request performance and avoid cold start delays.
 */

import { getCodexInstructions } from "../prompts/codex.js";
import { getOpenCodeCodexPrompt } from "../prompts/opencode-codex.js";
import { logDebug, logWarn } from "../logger.js";

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
export async function warmCachesOnStartup(): Promise<CacheWarmResult> {
	const startTime = Date.now();
	const result: CacheWarmResult = {
		success: false,
		codexInstructionsWarmed: false,
		opencodePromptWarmed: false,
		duration: 0,
	};

	logDebug("Starting cache warming on startup");

	try {
		// Warm Codex instructions cache (most critical)
		try {
			await getCodexInstructions();
			result.codexInstructionsWarmed = true;
			logDebug("Codex instructions cache warmed successfully");
		} catch (error) {
			logWarn(`Failed to warm Codex instructions cache: ${error instanceof Error ? error.message : String(error)}`);
		}

		// Warm OpenCode prompt cache (used for filtering)
		try {
			await getOpenCodeCodexPrompt();
			result.opencodePromptWarmed = true;
			logDebug("OpenCode prompt cache warmed successfully");
		} catch (error) {
			logWarn(`Failed to warm OpenCode prompt cache: ${error instanceof Error ? error.message : String(error)}`);
		}

		// Consider successful if at least one cache warmed
		result.success = result.codexInstructionsWarmed || result.opencodePromptWarmed;

	} catch (error) {
		result.error = error instanceof Error ? error.message : String(error);
		logWarn(`Cache warming failed: ${result.error}`);
	} finally {
		result.duration = Date.now() - startTime;
		
		if (result.success) {
			logDebug(`Cache warming completed in ${result.duration}ms (Codex: ${result.codexInstructionsWarmed}, OpenCode: ${result.opencodePromptWarmed})`);
		} else {
			logWarn(`Cache warming failed after ${result.duration}ms`);
		}
	}

	return result;
}

/**
 * Check if caches are already warm (have valid entries)
 * Used to avoid redundant warming operations
 * 
 * @returns Promise<boolean> - True if caches appear to be warm
 */
export async function areCachesWarm(): Promise<boolean> {
	try {
		// Try to get cached values without forcing refresh
		const codexInstructions = await getCodexInstructions();
		const opencodePrompt = await getOpenCodeCodexPrompt();
		
		// If both return values without errors, caches are likely warm
		return !!(codexInstructions && opencodePrompt);
	} catch (error) {
		// Any error suggests caches are not warm
		return false;
	}
}

/**
 * Get cache warming statistics for monitoring
 * 
 * @returns Promise<object> - Cache status information
 */
export async function getCacheWarmingStats(): Promise<{
	codexInstructionsCached: boolean;
	opencodePromptCached: boolean;
	lastWarmingResult?: CacheWarmResult;
}> {
	const stats = {
		codexInstructionsCached: false,
		opencodePromptCached: false,
	};

	try {
		// Check if cached values exist (without forcing refresh)
		const codexInstructions = await getCodexInstructions();
		stats.codexInstructionsCached = !!codexInstructions;
	} catch (error) {
		stats.codexInstructionsCached = false;
	}

	try {
		const opencodePrompt = await getOpenCodeCodexPrompt();
		stats.opencodePromptCached = !!opencodePrompt;
	} catch (error) {
		stats.opencodePromptCached = false;
	}

	return stats;
}