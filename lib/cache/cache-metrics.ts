/**
 * Cache metrics collection utilities
 *
 * Tracks cache performance metrics including hit rates, miss rates,
 * and overall cache efficiency for monitoring and optimization.
 */

/**
 * Cache metrics interface
 */
export interface CacheMetrics {
	hits: number;
	misses: number;
	evictions: number;
	totalRequests: number;
	hitRate: number;
	lastReset: number;
}

/**
 * Cache-specific metrics
 */
export interface CacheMetricsCollection {
	codexInstructions: CacheMetrics;
	opencodePrompt: CacheMetrics;
	bridgeDecisions: CacheMetrics;
	overall: CacheMetrics;
}

/**
 * Metrics collector for cache performance
 */
class CacheMetricsCollector {
	private metrics: CacheMetricsCollection = {
		codexInstructions: {
			hits: 0,
			misses: 0,
			evictions: 0,
			totalRequests: 0,
			hitRate: 0,
			lastReset: Date.now(),
		},
		opencodePrompt: { hits: 0, misses: 0, evictions: 0, totalRequests: 0, hitRate: 0, lastReset: Date.now() },
		bridgeDecisions: {
			hits: 0,
			misses: 0,
			evictions: 0,
			totalRequests: 0,
			hitRate: 0,
			lastReset: Date.now(),
		},
		overall: { hits: 0, misses: 0, evictions: 0, totalRequests: 0, hitRate: 0, lastReset: Date.now() },
	};

	/**
	 * Record a cache hit
	 * @param cacheType - Type of cache
	 */
	recordHit(cacheType: keyof Omit<CacheMetricsCollection, "overall">): void {
		this.metrics[cacheType].hits++;
		this.metrics[cacheType].totalRequests++;
		this.metrics.overall.hits++;
		this.metrics.overall.totalRequests++;
		this.updateHitRate(cacheType);
		this.updateHitRate("overall");
	}

	/**
	 * Record a cache miss
	 * @param cacheType - Type of cache
	 */
	recordMiss(cacheType: keyof Omit<CacheMetricsCollection, "overall">): void {
		this.metrics[cacheType].misses++;
		this.metrics[cacheType].totalRequests++;
		this.metrics.overall.misses++;
		this.metrics.overall.totalRequests++;
		this.updateHitRate(cacheType);
		this.updateHitRate("overall");
	}

	/**
	 * Record a cache eviction
	 * @param cacheType - Type of cache
	 */
	recordEviction(cacheType: keyof Omit<CacheMetricsCollection, "overall">): void {
		this.metrics[cacheType].evictions++;
		this.metrics.overall.evictions++;
	}

	/**
	 * Update hit rate for a cache type
	 * @param cacheType - Type of cache
	 */
	private updateHitRate(cacheType: keyof CacheMetricsCollection): void {
		const metrics = this.metrics[cacheType];
		metrics.hitRate = metrics.totalRequests > 0 ? (metrics.hits / metrics.totalRequests) * 100 : 0;
	}

	private cloneMetrics(): CacheMetricsCollection {
		const cloneMetric = (metric: CacheMetrics): CacheMetrics => ({ ...metric });
		return {
			codexInstructions: cloneMetric(this.metrics.codexInstructions),
			opencodePrompt: cloneMetric(this.metrics.opencodePrompt),
			bridgeDecisions: cloneMetric(this.metrics.bridgeDecisions),
			overall: cloneMetric(this.metrics.overall),
		};
	}

	/**
	 * Get current metrics
	 * @returns Complete metrics collection
	 */
	getMetrics(): CacheMetricsCollection {
		return this.cloneMetrics();
	}

	/**
	 * Get metrics summary for logging
	 * @returns Formatted metrics summary
	 */
	getMetricsSummary(): string {
		const summary = [];

		for (const [cacheName, metrics] of Object.entries(this.metrics)) {
			if (cacheName === "overall") continue;

			summary.push(
				`${cacheName}: ${metrics.hits}/${metrics.totalRequests} ` +
					`(${metrics.hitRate.toFixed(1)}% hit rate, ${metrics.evictions} evictions)`,
			);
		}

		summary.push(
			`overall: ${this.metrics.overall.hits}/${this.metrics.overall.totalRequests} ` +
				`(${this.metrics.overall.hitRate.toFixed(1)}% hit rate)`,
		);

		return summary.join(" | ");
	}

	/**
	 * Reset all metrics
	 */
	reset(): void {
		const now = Date.now();
		for (const key of Object.keys(this.metrics) as Array<keyof CacheMetricsCollection>) {
			this.metrics[key] = {
				hits: 0,
				misses: 0,
				evictions: 0,
				totalRequests: 0,
				hitRate: 0,
				lastReset: now,
			};
		}
		// Cache metrics reset
	}

	/**
	 * Check if metrics should be reset (based on time)
	 * @param resetIntervalMs - Reset interval in milliseconds
	 * @returns True if metrics should be reset
	 */
	shouldReset(resetIntervalMs = 60 * 60 * 1000): boolean {
		// Default 1 hour
		return Date.now() - this.metrics.overall.lastReset > resetIntervalMs;
	}
}

// Global metrics collector instance
const metricsCollector = new CacheMetricsCollector();

/**
 * Record a cache hit
 * @param cacheType - Type of cache
 */
export function recordCacheHit(cacheType: keyof Omit<CacheMetricsCollection, "overall">): void {
	metricsCollector.recordHit(cacheType);
}

/**
 * Record a cache miss
 * @param cacheType - Type of cache
 */
export function recordCacheMiss(cacheType: keyof Omit<CacheMetricsCollection, "overall">): void {
	metricsCollector.recordMiss(cacheType);
}

/**
 * Record a cache eviction
 * @param cacheType - Type of cache
 */
export function recordCacheEviction(cacheType: keyof Omit<CacheMetricsCollection, "overall">): void {
	metricsCollector.recordEviction(cacheType);
}

/**
 * Get current cache metrics
 * @returns Complete metrics collection
 */
export function getCacheMetrics(): CacheMetricsCollection {
	return metricsCollector.getMetrics();
}

/**
 * Get formatted metrics summary for logging
 * @returns Formatted metrics summary
 */
export function getCacheMetricsSummary(): string {
	return metricsCollector.getMetricsSummary();
}

/**
 * Reset cache metrics
 */
export function resetCacheMetrics(): void {
	metricsCollector.reset();
}

/**
 * Auto-reset metrics if interval has passed
 * @param resetIntervalMs - Reset interval in milliseconds
 */
export function autoResetCacheMetrics(resetIntervalMs = 60 * 60 * 1000): void {
	if (metricsCollector.shouldReset(resetIntervalMs)) {
		resetCacheMetrics();
	}
}

/**
 * Get cache performance report
 * @returns Detailed performance report
 */
export function getCachePerformanceReport(): {
	summary: string;
	details: CacheMetricsCollection;
	recommendations: string[];
} {
	const metrics = getCacheMetrics();
	const summary = getCacheMetricsSummary();

	const recommendations: string[] = [];

	// Analyze performance and generate recommendations
	if (metrics.overall.hitRate < 70) {
		recommendations.push("Consider increasing cache TTL for better hit rates");
	}

	if (metrics.overall.evictions > 100) {
		recommendations.push("High eviction count - consider increasing cache size limits");
	}

	if (metrics.overall.totalRequests < 10) {
		recommendations.push("Low cache usage - metrics may not be representative");
	}

	return {
		summary,
		details: metrics,
		recommendations,
	};
}
