import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCodePromptCache } from "../lib/cache/session-cache.js";

const files = new Map<string, string>();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const mkdirMock = vi.fn();
const homedirMock = vi.fn(() => "/mock-home");
const fetchMock = vi.fn();
const recordCacheHitMock = vi.fn();
const recordCacheMissMock = vi.fn();

vi.mock("node:fs/promises", () => ({
	mkdir: mkdirMock,
	readFile: readFileMock,
	writeFile: writeFileMock,
}));

vi.mock("node:os", () => ({
	__esModule: true,
	homedir: homedirMock,
}));

vi.mock("../lib/cache/session-cache.js", () => ({
	openCodePromptCache: {
		get: vi.fn(),
		set: vi.fn(),
		clear: vi.fn(),
	},
	getOpenCodeCacheKey: vi.fn(),
}));

vi.mock("../lib/cache/cache-metrics.js", () => ({
	recordCacheHit: recordCacheHitMock,
	recordCacheMiss: recordCacheMissMock,
}));

describe("OpenCode Codex Prompt Fetcher", () => {
	const cacheDir = join("/mock-home", ".opencode", "cache");
	const cacheFile = join(cacheDir, "openhax-codex-opencode-prompt.txt");
	const cacheMetaFile = join(cacheDir, "openhax-codex-opencode-prompt-meta.json");

	beforeEach(() => {
		files.clear();
		readFileMock.mockClear();
		writeFileMock.mockClear();
		mkdirMock.mockClear();
		homedirMock.mockReturnValue("/mock-home");
		fetchMock.mockClear();
		recordCacheHitMock.mockClear();
		recordCacheMissMock.mockClear();
		openCodePromptCache.clear();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("getOpenCodeCodexPrompt", () => {
		it("returns cached content from session cache when available", async () => {
			const cachedData = "cached-prompt-content";
			openCodePromptCache.get = vi.fn().mockReturnValue({ data: cachedData, etag: "etag-123" });

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			const result = await getOpenCodeCodexPrompt();

			expect(result).toBe(cachedData);
			expect(recordCacheHitMock).toHaveBeenCalledWith("opencodePrompt");
			expect(recordCacheMissMock).not.toHaveBeenCalled();
			expect(readFileMock).not.toHaveBeenCalled();
			expect(mkdirMock).toHaveBeenCalled(); // Should still call mkdir for cache directory
		});

		it("falls back to file cache when session cache misses", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);
			const cachedContent = "file-cached-content";
			const cachedMeta = { etag: '"file-etag"', lastChecked: Date.now() - 20 * 60 * 1000 }; // 20 minutes ago (outside TTL)

			readFileMock.mockImplementation((path) => {
				if (path === cacheFile) return Promise.resolve(cachedContent);
				if (path === cacheMetaFile) return Promise.resolve(JSON.stringify(cachedMeta));
				return Promise.reject(new Error("File not found"));
			});

			fetchMock.mockResolvedValue(
				new Response("fresh-content", {
					status: 200,
					headers: { etag: '"new-etag"' },
				}),
			);

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			const result = await getOpenCodeCodexPrompt();

			expect(result).toBe("fresh-content");
			expect(recordCacheMissMock).toHaveBeenCalledWith("opencodePrompt");
			expect(writeFileMock).toHaveBeenCalledTimes(2);
			// Check that both files were written (order doesn't matter)
			const writeCalls = writeFileMock.mock.calls;
			expect(writeCalls).toHaveLength(2);

			// Find calls by file path
			const contentFileCall = writeCalls.find((call) => call[0] === cacheFile);
			const metaFileCall = writeCalls.find((call) => call[0] === cacheMetaFile);

			expect(contentFileCall).toBeTruthy();
			expect(metaFileCall).toBeTruthy();
			expect(contentFileCall?.[1]).toBe("fresh-content");
			expect(contentFileCall?.[2]).toBe("utf-8");
			expect(metaFileCall?.[2]).toBe("utf-8");
			expect(metaFileCall?.[1]).toContain("new-etag");
		});

		it("uses file cache when within TTL period", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);
			const cachedContent = "recent-cache-content";
			const recentTime = Date.now() - 5 * 60 * 1000; // 5 minutes ago
			const cachedMeta = { etag: '"recent-etag"', lastChecked: recentTime };

			readFileMock.mockImplementation((path) => {
				if (path === cacheFile) return Promise.resolve(cachedContent);
				if (path === cacheMetaFile) return Promise.resolve(JSON.stringify(cachedMeta));
				return Promise.reject(new Error("File not found"));
			});

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			const result = await getOpenCodeCodexPrompt();

			expect(result).toBe(cachedContent);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(openCodePromptCache.set).toHaveBeenCalledWith("main", {
				data: cachedContent,
				etag: '"recent-etag"',
			});
		});

		it("handles 304 Not Modified response", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);
			const cachedContent = "not-modified-content";
			const oldTime = Date.now() - 20 * 60 * 1000; // 20 minutes ago
			const cachedMeta = { etag: '"old-etag"', lastChecked: oldTime };

			readFileMock.mockImplementation((path) => {
				if (path === cacheFile) return Promise.resolve(cachedContent);
				if (path === cacheMetaFile) return Promise.resolve(JSON.stringify(cachedMeta));
				return Promise.reject(new Error("File not found"));
			});

			fetchMock.mockResolvedValue(
				new Response(null, {
					status: 304,
					headers: {},
				}),
			);

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			const result = await getOpenCodeCodexPrompt();

			expect(result).toBe(cachedContent);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const fetchCall = fetchMock.mock.calls[0];
			expect(fetchCall[0]).toContain("github");
			expect(typeof fetchCall[1]).toBe("object");
			expect(fetchCall[1]).toHaveProperty("headers");
			expect((fetchCall[1] as any).headers).toEqual({ "If-None-Match": '"old-etag"' });
		});

		it("handles fetch failure with fallback to cache", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);
			const cachedContent = "fallback-content";
			const oldTime = Date.now() - 20 * 60 * 1000;
			const cachedMeta = { etag: '"fallback-etag"', lastChecked: oldTime };

			readFileMock.mockImplementation((path) => {
				if (path === cacheFile) return Promise.resolve(cachedContent);
				if (path === cacheMetaFile) return Promise.resolve(JSON.stringify(cachedMeta));
				return Promise.reject(new Error("File not found"));
			});

			fetchMock.mockRejectedValue(new Error("Network error"));

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			const result = await getOpenCodeCodexPrompt();

			expect(result).toBe(cachedContent);
			expect(openCodePromptCache.set).toHaveBeenCalledWith("main", {
				data: cachedContent,
				etag: '"fallback-etag"',
			});
		});

		it("throws error when no cache available and fetch fails", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);

			readFileMock.mockRejectedValue(new Error("No cache file"));

			fetchMock.mockRejectedValue(new Error("Network error"));

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");

			await expect(getOpenCodeCodexPrompt()).rejects.toThrow(
				"Failed to fetch OpenCode codex.txt and no cache available",
			);
		});

		it("handles non-200 response status with fallback to cache", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);
			const cachedContent = "error-fallback-content";
			const oldTime = Date.now() - 20 * 60 * 1000;
			const cachedMeta = { etag: '"error-etag"', lastChecked: oldTime };

			readFileMock.mockImplementation((path) => {
				if (path === cacheFile) return Promise.resolve(cachedContent);
				if (path === cacheMetaFile) return Promise.resolve(JSON.stringify(cachedMeta));
				return Promise.reject(new Error("File not found"));
			});

			fetchMock.mockResolvedValue(new Response("Error", { status: 500 }));

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			const result = await getOpenCodeCodexPrompt();

			expect(result).toBe(cachedContent);
		});

		it("creates cache directory when it does not exist", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);
			readFileMock.mockRejectedValue(new Error("No cache files"));
			fetchMock.mockResolvedValue(
				new Response("new-content", {
					status: 200,
					headers: { etag: '"new-etag"' },
				}),
			);

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			await getOpenCodeCodexPrompt();

			expect(mkdirMock).toHaveBeenCalledWith(cacheDir, { recursive: true });
		});

		it("handles missing etag in response", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);
			readFileMock.mockRejectedValue(new Error("No cache files"));
			fetchMock.mockResolvedValue(
				new Response("no-etag-content", {
					status: 200,
					headers: {}, // No etag header
				}),
			);

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			const result = await getOpenCodeCodexPrompt();

			expect(result).toBe("no-etag-content");
			expect(writeFileMock).toHaveBeenCalledWith(
				cacheMetaFile,
				expect.stringContaining('"etag": ""'),
				"utf-8",
			);
		});

		it("handles malformed cache metadata", async () => {
			openCodePromptCache.get = vi.fn().mockReturnValue(undefined);
			const cachedContent = "good-content";

			readFileMock.mockImplementation((path) => {
				if (path === cacheFile) return Promise.resolve(cachedContent);
				if (path === cacheMetaFile) return Promise.resolve("invalid json");
				return Promise.reject(new Error("File not found"));
			});

			fetchMock.mockResolvedValue(
				new Response("fresh-content", {
					status: 200,
					headers: { etag: '"fresh-etag"' },
				}),
			);

			const { getOpenCodeCodexPrompt } = await import("../lib/prompts/opencode-codex.js");
			const result = await getOpenCodeCodexPrompt();

			expect(result).toBe("fresh-content");
		});
	});

	describe("getCachedPromptPrefix", () => {
		it("returns first N characters of cached content", async () => {
			const fullContent = "This is the full cached prompt content for testing";
			readFileMock.mockResolvedValue(fullContent);

			const { getCachedPromptPrefix } = await import("../lib/prompts/opencode-codex.js");
			const result = await getCachedPromptPrefix(10);

			expect(result).toBe("This is th");
			expect(readFileMock).toHaveBeenCalledWith(cacheFile, "utf-8");
		});

		it("returns null when cache file does not exist", async () => {
			readFileMock.mockRejectedValue(new Error("File not found"));

			const { getCachedPromptPrefix } = await import("../lib/prompts/opencode-codex.js");
			const result = await getCachedPromptPrefix();

			expect(result).toBeNull();
		});

		it("uses default character count when not specified", async () => {
			const fullContent = "A".repeat(100);
			readFileMock.mockResolvedValue(fullContent);

			const { getCachedPromptPrefix } = await import("../lib/prompts/opencode-codex.js");
			const result = await getCachedPromptPrefix();

			expect(result).toBe("A".repeat(50));
		});

		it("handles content shorter than requested characters", async () => {
			const shortContent = "Short";
			readFileMock.mockResolvedValue(shortContent);

			const { getCachedPromptPrefix } = await import("../lib/prompts/opencode-codex.js");
			const result = await getCachedPromptPrefix(20);

			expect(result).toBe("Short");
		});
	});
});
