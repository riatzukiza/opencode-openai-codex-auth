/**
 * Tests for cache warming functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { warmCachesOnStartup, areCachesWarm, getCacheWarmingStats } from '../lib/cache/cache-warming.js';
import { getCodexInstructions } from '../lib/prompts/codex.js';
import { getOpenCodeCodexPrompt } from '../lib/prompts/opencode-codex.js';
import { logDebug, logWarn } from '../lib/logger.js';
import { codexInstructionsCache, openCodePromptCache } from '../lib/cache/session-cache.js';

// Mock dependencies
vi.mock('../lib/prompts/codex.js', () => ({
	getCodexInstructions: vi.fn(),
}));
vi.mock('../lib/prompts/opencode-codex.js', () => ({
	getOpenCodeCodexPrompt: vi.fn(),
}));
vi.mock('../lib/logger.js', () => ({
	logDebug: vi.fn(),
	logWarn: vi.fn(),
	logRequest: vi.fn(),
	LOGGING_ENABLED: false,
}));

const mockGetCodexInstructions = getCodexInstructions as ReturnType<typeof vi.fn>;
const mockGetOpenCodeCodexPrompt = getOpenCodeCodexPrompt as ReturnType<typeof vi.fn>;
const mockLogDebug = logDebug as ReturnType<typeof vi.fn>;
const mockLogWarn = logWarn as ReturnType<typeof vi.fn>;

describe('Cache Warming', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		codexInstructionsCache.clear();
		openCodePromptCache.clear();
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
			codexInstructionsCache.set('latest', { data: 'codex-instructions' });
			openCodePromptCache.set('main', { data: 'opencode-prompt' });

			// Act
			const result = await areCachesWarm();

			// Assert
			expect(result).toBe(true);
			expect(mockGetCodexInstructions).not.toHaveBeenCalled();
			expect(mockGetOpenCodeCodexPrompt).not.toHaveBeenCalled();
		});

		it('should return false when Codex instructions cache is cold', async () => {
			openCodePromptCache.set('main', { data: 'opencode-prompt' });

			// Act
			const result = await areCachesWarm();

			// Assert
			expect(result).toBe(false);
		});

		it('should return false when OpenCode prompt cache is cold', async () => {
			codexInstructionsCache.set('latest', { data: 'codex-instructions' });

			// Act
			const result = await areCachesWarm();

			// Assert
			expect(result).toBe(false);
		});

		it('should return false when both caches are cold', async () => {
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
			codexInstructionsCache.set('latest', { data: 'codex-instructions' });
			openCodePromptCache.set('main', { data: 'opencode-prompt' });

			const stats = await getCacheWarmingStats();

			expect(stats.codexInstructionsCached).toBe(true);
			expect(stats.opencodePromptCached).toBe(true);
		});

		it('should return correct stats when caches are cold', async () => {
			const stats = await getCacheWarmingStats();

			expect(stats.codexInstructionsCached).toBe(false);
			expect(stats.opencodePromptCached).toBe(false);
		});

		it('should handle mixed cache states', async () => {
			codexInstructionsCache.set('latest', { data: 'codex-instructions' });

			const stats = await getCacheWarmingStats();

			expect(stats.codexInstructionsCached).toBe(true);
			expect(stats.opencodePromptCached).toBe(false);
		});

		it('includes last warming result when available', async () => {
			mockGetCodexInstructions.mockResolvedValue('codex-instructions');
			mockGetOpenCodeCodexPrompt.mockResolvedValue('opencode-prompt');

			await warmCachesOnStartup();
			const stats = await getCacheWarmingStats();

			expect(stats.lastWarmingResult?.success).toBe(true);
			expect(stats.lastWarmingResult?.codexInstructionsWarmed).toBe(true);
			expect(stats.lastWarmingResult?.opencodePromptWarmed).toBe(true);
		});
	});

		describe('integration scenarios', () => {
			it('should handle cache warming workflow end-to-end', async () => {
				// Arrange - simulate cold caches
				mockGetCodexInstructions
					.mockImplementationOnce(async () => {
						codexInstructionsCache.set('latest', { data: 'codex-instructions' });
						return 'codex-instructions';
					})
					.mockImplementationOnce(async () => 'codex-instructions');

				mockGetOpenCodeCodexPrompt
					.mockImplementationOnce(async () => {
						openCodePromptCache.set('main', { data: 'opencode-prompt' });
						return 'opencode-prompt';
					})
					.mockImplementationOnce(async () => 'opencode-prompt');

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
