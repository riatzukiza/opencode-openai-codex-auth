/**
 * Tests for cache warming functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { warmCachesOnStartup, areCachesWarm, getCacheWarmingStats } from '../lib/cache/cache-warming.js';
import { getCodexInstructions } from '../lib/prompts/codex.js';
import { getOpenCodeCodexPrompt } from '../lib/prompts/opencode-codex.js';
import { logDebug, logWarn } from '../lib/logger.js';

// Mock dependencies
vi.mock('../lib/prompts/codex.js');
vi.mock('../lib/prompts/opencode-codex.js');
vi.mock('../lib/logger.js');

const mockGetCodexInstructions = vi.mocked(getCodexInstructions);
const mockGetOpenCodeCodexPrompt = vi.mocked(getOpenCodeCodexPrompt);
const mockLogDebug = vi.mocked(logDebug);
const mockLogWarn = vi.mocked(logWarn);

describe('Cache Warming', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('warmCachesOnStartup', () => {
		it('should warm both caches successfully', async () => {
			// Arrange
			mockGetCodexInstructions.mockResolvedValue('codex-instructions');
			mockGetOpenCodeCodexPrompt.mockResolvedValue('opencode-prompt');

			// Act
			const result = await warmCachesOnStartup();

			// Assert
			expect(result.success).toBe(true);
			expect(result.codexInstructionsWarmed).toBe(true);
			expect(result.opencodePromptWarmed).toBe(true);
			expect(result.error).toBeUndefined();
			expect(result.duration).toBeGreaterThanOrEqual(0);
			
			expect(mockGetCodexInstructions).toHaveBeenCalledTimes(1); // Called once for warming
			expect(mockGetOpenCodeCodexPrompt).toHaveBeenCalledTimes(1);
			expect(mockLogDebug).toHaveBeenCalledWith('Starting cache warming on startup');
			expect(mockLogDebug).toHaveBeenCalledWith('Codex instructions cache warmed successfully');
			expect(mockLogDebug).toHaveBeenCalledWith('OpenCode prompt cache warmed successfully');
		});

		it('should handle partial cache warming failure', async () => {
			// Arrange
			mockGetCodexInstructions.mockResolvedValue('codex-instructions');
			mockGetOpenCodeCodexPrompt.mockRejectedValue(new Error('Network error'));

			// Act
			const result = await warmCachesOnStartup();

			// Assert
			expect(result.success).toBe(true); // Still successful if one cache warms
			expect(result.codexInstructionsWarmed).toBe(true);
			expect(result.opencodePromptWarmed).toBe(false);
			expect(result.error).toBeUndefined();
			
			expect(mockLogWarn).toHaveBeenCalledWith('Failed to warm OpenCode prompt cache: Network error');
		});

		it('should handle complete cache warming failure', async () => {
			// Arrange
			const criticalError = new Error('Critical error');
			mockGetCodexInstructions.mockRejectedValue(criticalError);
			mockGetOpenCodeCodexPrompt.mockRejectedValue(new Error('Network error'));

			// Act
			const result = await warmCachesOnStartup();

			// Assert
			expect(result.success).toBe(false);
			expect(result.codexInstructionsWarmed).toBe(false);
			expect(result.opencodePromptWarmed).toBe(false);
			expect(result.error).toBe('Critical error');
			
			expect(mockLogWarn).toHaveBeenCalledWith('Failed to warm Codex instructions cache: Critical error');
			expect(mockLogWarn).toHaveBeenCalledWith('Failed to warm OpenCode prompt cache: Network error');
			expect(mockLogWarn).toHaveBeenCalledWith('Cache warming failed after 0ms');
		});

		it('should measure warming duration', async () => {
			// Arrange
			mockGetCodexInstructions.mockResolvedValue('codex-instructions');
			mockGetOpenCodeCodexPrompt.mockResolvedValue('opencode-prompt');

			// Act
			const result = await warmCachesOnStartup();

			// Assert
			expect(result.duration).toBeGreaterThanOrEqual(0);
			expect(result.duration).toBeLessThan(1000); // Should be reasonable
			expect(mockLogDebug).toHaveBeenCalledWith(expect.stringContaining('Cache warming completed in'));
		});
	});

	describe('areCachesWarm', () => {
		it('should return true when both caches are warm', async () => {
			// Arrange
			mockGetCodexInstructions.mockResolvedValue('codex-instructions');
			mockGetOpenCodeCodexPrompt.mockResolvedValue('opencode-prompt');

			// Act
			const result = await areCachesWarm();

			// Assert
			expect(result).toBe(true);
			expect(mockGetCodexInstructions).toHaveBeenCalledTimes(1);
			expect(mockGetOpenCodeCodexPrompt).toHaveBeenCalledTimes(1);
		});

		it('should return false when Codex instructions cache is cold', async () => {
			// Arrange
			mockGetCodexInstructions.mockRejectedValue(new Error('Cache miss'));
			mockGetOpenCodeCodexPrompt.mockResolvedValue('opencode-prompt');

			// Act
			const result = await areCachesWarm();

			// Assert
			expect(result).toBe(false);
		});

		it('should return false when OpenCode prompt cache is cold', async () => {
			// Arrange
			mockGetCodexInstructions.mockResolvedValue('codex-instructions');
			mockGetOpenCodeCodexPrompt.mockRejectedValue(new Error('Cache miss'));

			// Act
			const result = await areCachesWarm();

			// Assert
			expect(result).toBe(false);
		});

		it('should return false when both caches are cold', async () => {
			// Arrange
			mockGetCodexInstructions.mockRejectedValue(new Error('Cache miss'));
			mockGetOpenCodeCodexPrompt.mockRejectedValue(new Error('Cache miss'));

			// Act
			const result = await areCachesWarm();

			// Assert
			expect(result).toBe(false);
		});
	});

	describe('getCacheWarmingStats', () => {
		it('should return correct stats when caches are warm', async () => {
			// Arrange
			mockGetCodexInstructions.mockResolvedValue('codex-instructions');
			mockGetOpenCodeCodexPrompt.mockResolvedValue('opencode-prompt');

			// Act
			const stats = await getCacheWarmingStats();

			// Assert
			expect(stats.codexInstructionsCached).toBe(true);
			expect(stats.opencodePromptCached).toBe(true);
		});

		it('should return correct stats when caches are cold', async () => {
			// Arrange
			mockGetCodexInstructions.mockRejectedValue(new Error('Cache miss'));
			mockGetOpenCodeCodexPrompt.mockRejectedValue(new Error('Cache miss'));

			// Act
			const stats = await getCacheWarmingStats();

			// Assert
			expect(stats.codexInstructionsCached).toBe(false);
			expect(stats.opencodePromptCached).toBe(false);
		});

		it('should handle mixed cache states', async () => {
			// Arrange
			mockGetCodexInstructions.mockResolvedValue('codex-instructions');
			mockGetOpenCodeCodexPrompt.mockRejectedValue(new Error('Cache miss'));

			// Act
			const stats = await getCacheWarmingStats();

			// Assert
			expect(stats.codexInstructionsCached).toBe(true);
			expect(stats.opencodePromptCached).toBe(false);
		});
	});

	describe('integration scenarios', () => {
		it('should handle cache warming workflow end-to-end', async () => {
			// Arrange - simulate cold caches
			mockGetCodexInstructions
				.mockRejectedValueOnce(new Error('Cache miss')) // areCachesWarm check
				.mockResolvedValueOnce('codex-instructions') // warmCachesOnStartup
				.mockResolvedValueOnce('codex-instructions'); // areCachesWarm after warming
			
			mockGetOpenCodeCodexPrompt
				.mockRejectedValueOnce(new Error('Cache miss')) // areCachesWarm check
				.mockResolvedValueOnce('opencode-prompt') // warmCachesOnStartup
				.mockResolvedValueOnce('opencode-prompt'); // areCachesWarm after warming

			// Act & Assert - Check initial state
			const initiallyWarm = await areCachesWarm();
			expect(initiallyWarm).toBe(false);

			// Warm caches
			const warmResult = await warmCachesOnStartup();
			expect(warmResult.success).toBe(true);

			// Check final state
			const finallyWarm = await areCachesWarm();
			expect(finallyWarm).toBe(true);

			// Get stats
			const stats = await getCacheWarmingStats();
			expect(stats.codexInstructionsCached).toBe(true);
			expect(stats.opencodePromptCached).toBe(true);
		});
	});
});