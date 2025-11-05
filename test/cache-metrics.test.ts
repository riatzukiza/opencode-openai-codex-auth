/**
 * Tests for cache metrics functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	recordCacheHit,
	recordCacheMiss,
	recordCacheEviction,
	getCacheMetrics,
	getCacheMetricsSummary,
	resetCacheMetrics,
	autoResetCacheMetrics,
	getCachePerformanceReport,
} from '../lib/cache/cache-metrics.js';
import { logDebug } from '../lib/logger.js';

// Mock dependencies
vi.mock('../lib/logger.js', () => ({
	logDebug: vi.fn(),
	logWarn: vi.fn(),
	logRequest: vi.fn(),
	LOGGING_ENABLED: false,
}));
const mockLogDebug = logDebug as ReturnType<typeof vi.fn>;

describe('Cache Metrics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		resetCacheMetrics();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('Basic Metrics Recording', () => {
		it('should record cache hits correctly', () => {
			// Act
			recordCacheHit('codexInstructions');
			recordCacheHit('codexInstructions');
			recordCacheHit('opencodePrompt');

			// Assert
			const metrics = getCacheMetrics();
			expect(metrics.codexInstructions.hits).toBe(2);
			expect(metrics.codexInstructions.totalRequests).toBe(2);
			expect(metrics.codexInstructions.hitRate).toBe(100);
			
			expect(metrics.opencodePrompt.hits).toBe(1);
			expect(metrics.opencodePrompt.totalRequests).toBe(1);
			expect(metrics.opencodePrompt.hitRate).toBe(100);
			
			expect(metrics.overall.hits).toBe(3);
			expect(metrics.overall.totalRequests).toBe(3);
			expect(metrics.overall.hitRate).toBe(100);
		});

		it('should record cache misses correctly', () => {
			// Act
			recordCacheMiss('codexInstructions');
			recordCacheMiss('codexInstructions');
			recordCacheHit('codexInstructions'); // 1 hit, 2 misses

			// Assert
		const metrics = getCacheMetrics();
		expect(metrics.codexInstructions.hits).toBe(1);
		expect(metrics.codexInstructions.misses).toBe(2);
		expect(metrics.codexInstructions.totalRequests).toBe(3);
		expect(metrics.codexInstructions.hitRate).toBeCloseTo(33.333333333333336, 10);
			
			expect(metrics.overall.hits).toBe(1);
			expect(metrics.overall.misses).toBe(2);
			expect(metrics.overall.totalRequests).toBe(3);
		});

		it('should record cache evictions correctly', () => {
			// Act
			recordCacheEviction('codexInstructions');
			recordCacheEviction('opencodePrompt');

			// Assert
			const metrics = getCacheMetrics();
			expect(metrics.codexInstructions.evictions).toBe(1);
			expect(metrics.opencodePrompt.evictions).toBe(1);
			expect(metrics.overall.evictions).toBe(2);
		});
	});

	describe('Metrics Summary', () => {
		it('should generate formatted summary', () => {
			// Arrange
			recordCacheHit('codexInstructions');
			recordCacheMiss('codexInstructions');
			recordCacheHit('opencodePrompt');

			// Act
			const summary = getCacheMetricsSummary();

			// Assert
			expect(summary).toContain('codexInstructions: 1/2 (50.0% hit rate, 0 evictions)');
			expect(summary).toContain('opencodePrompt: 1/1 (100.0% hit rate, 0 evictions)');
			expect(summary).toContain('overall: 2/3 (66.7% hit rate)');
		});
	});

	describe('Metrics Reset', () => {
		it('should reset all metrics', () => {
			// Arrange
			recordCacheHit('codexInstructions');
			recordCacheMiss('opencodePrompt');
			recordCacheEviction('bridgeDecisions');

			// Act
			resetCacheMetrics();

			// Assert
			const metrics = getCacheMetrics();
			expect(metrics.codexInstructions.hits).toBe(0);
			expect(metrics.codexInstructions.misses).toBe(0);
			expect(metrics.codexInstructions.evictions).toBe(0);
			expect(metrics.codexInstructions.totalRequests).toBe(0);
			expect(metrics.codexInstructions.hitRate).toBe(0);
			
			expect(metrics.overall.hits).toBe(0);
			expect(metrics.overall.misses).toBe(0);
			expect(metrics.overall.evictions).toBe(0);
			expect(metrics.overall.totalRequests).toBe(0);
			expect(metrics.overall.hitRate).toBe(0);
			
			expect(mockLogDebug).toHaveBeenCalledWith('Cache metrics reset');
		});
	});

	describe('Auto Reset', () => {
		it('should reset metrics based on time interval', () => {
			// Arrange
			recordCacheHit('codexInstructions');
			vi.setSystemTime(new Date('2023-01-01T00:00:00Z'));
			resetCacheMetrics(); // Sets lastReset to current time
			
			recordCacheHit('codexInstructions');
			
			// Act - advance time by 2 hours
			vi.setSystemTime(new Date('2023-01-01T02:00:00Z'));
			autoResetCacheMetrics(60 * 60 * 1000); // 1 hour interval

			// Assert - should have reset
			const metrics = getCacheMetrics();
			expect(metrics.overall.hits).toBe(0);
			expect(metrics.overall.totalRequests).toBe(0);
		});

		it('should not reset if interval has not passed', () => {
			// Arrange
			recordCacheHit('codexInstructions');
			vi.setSystemTime(new Date('2023-01-01T00:00:00Z'));
			resetCacheMetrics();
			
			recordCacheHit('codexInstructions');
			
			// Act - advance time by 30 minutes only
			vi.setSystemTime(new Date('2023-01-01T00:30:00Z'));
			autoResetCacheMetrics(60 * 60 * 1000); // 1 hour interval

			// Assert - should not have reset
		const metrics = getCacheMetrics();
		expect(metrics.overall.hits).toBe(1);
		expect(metrics.overall.totalRequests).toBe(1);
		});
	});

	describe('Performance Report', () => {
		it('should generate performance report with recommendations', () => {
			// Arrange - poor performance scenario
			for (let i = 0; i < 5; i++) {
				recordCacheMiss('codexInstructions');
			}
			for (let i = 0; i < 150; i++) {
				recordCacheEviction('opencodePrompt');
			}

			// Act
			const report = getCachePerformanceReport();

			// Assert
			expect(report.summary).toContain('codexInstructions: 0/5 (0.0% hit rate, 0 evictions)');
		expect(report.summary).toContain('opencodePrompt: 0/0 (0.0% hit rate, 150 evictions)');
			expect(report.summary).toContain('overall: 0/5 (0.0% hit rate)');
			
			expect(report.recommendations).toContain('Consider increasing cache TTL for better hit rates');
			expect(report.recommendations).toContain('High eviction count - consider increasing cache size limits');
			expect(report.recommendations).toContain('Low cache usage - metrics may not be representative');
			
			expect(report.details.codexInstructions.hits).toBe(0);
			expect(report.details.codexInstructions.misses).toBe(5);
			expect(report.details.opencodePrompt.evictions).toBe(150);
		});

		it('should generate no recommendations for good performance', () => {
			// Arrange - good performance scenario
			for (let i = 0; i < 80; i++) {
				recordCacheHit('codexInstructions');
			}
			for (let i = 0; i < 20; i++) {
				recordCacheMiss('codexInstructions');
			}
			// 80 hits, 20 misses = 80% hit rate, low evictions

			// Act
			const report = getCachePerformanceReport();

			// Assert
			expect(report.recommendations).not.toContain('Consider increasing cache TTL for better hit rates');
			expect(report.recommendations).not.toContain('High eviction count - consider increasing cache size limits');
			expect(report.recommendations).not.toContain('Low cache usage - metrics may not be representative');
		});
	});

	describe('Bridge Decision Metrics', () => {
		it('should track bridge decision cache separately', () => {
			// Act
			recordCacheHit('bridgeDecisions');
			recordCacheMiss('bridgeDecisions');

			// Assert
			const metrics = getCacheMetrics();
			expect(metrics.bridgeDecisions.hits).toBe(1);
			expect(metrics.bridgeDecisions.misses).toBe(1);
			expect(metrics.bridgeDecisions.totalRequests).toBe(2);
			expect(metrics.bridgeDecisions.hitRate).toBe(50);
		});
	});
});
