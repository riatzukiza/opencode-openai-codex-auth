/**
 * Tests for session cache eviction metrics
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCacheMetrics, resetCacheMetrics } from "../lib/cache/cache-metrics.js";
import {
	cleanupExpiredCaches,
	codexInstructionsCache,
	openCodePromptCache,
} from "../lib/cache/session-cache.js";

describe("Session Cache Evictions", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		resetCacheMetrics();
		codexInstructionsCache.clear();
		openCodePromptCache.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
		codexInstructionsCache.clear();
		openCodePromptCache.clear();
	});

	it("records evictions when expired entries are cleaned", () => {
		vi.setSystemTime(new Date("2023-01-01T00:00:00Z"));
		codexInstructionsCache.set("temp-codex", { data: "x" });
		openCodePromptCache.set("temp-opencode", { data: "y" });

		// Advance beyond 15 minutes TTL
		vi.setSystemTime(new Date("2023-01-01T00:16:00Z"));

		// Act
		cleanupExpiredCaches();

		// Assert
		const metrics = getCacheMetrics();
		expect(metrics.codexInstructions.evictions).toBeGreaterThanOrEqual(1);
		expect(metrics.opencodePrompt.evictions).toBeGreaterThanOrEqual(1);
		expect(metrics.overall.evictions).toBeGreaterThanOrEqual(2);
	});
});
