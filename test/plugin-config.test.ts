import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCodexMode, loadPluginConfig } from "../lib/config.js";
import * as logger from "../lib/logger.js";
import type { PluginConfig } from "../lib/types.js";

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	appendFileSync: vi.fn(),
}));

// Get mocked functions
let mockExistsSync: any;
let mockReadFileSync: any;
let _mockWriteFileSync: any;
let _mockMkdirSync: any;

beforeEach(async () => {
	const fs = await import("node:fs");
	mockExistsSync = vi.mocked(fs.existsSync);
	mockReadFileSync = vi.mocked(fs.readFileSync);
	_mockWriteFileSync = vi.mocked(fs.writeFileSync);
	_mockMkdirSync = vi.mocked(fs.mkdirSync);
});

describe("Plugin Configuration", () => {
	let originalEnv: string | undefined;

	beforeEach(() => {
		originalEnv = process.env.CODEX_MODE;
		vi.clearAllMocks();
	});

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.CODEX_MODE;
		} else {
			process.env.CODEX_MODE = originalEnv;
		}
	});

	describe("loadPluginConfig", () => {
		it("should return default config when file does not exist", () => {
			mockExistsSync.mockReturnValue(false);

			const config = loadPluginConfig({ forceReload: true });

			expect(config).toEqual({
				codexMode: true,
				enablePromptCaching: true,
				enableCodexCompaction: true,
				autoCompactMinMessages: 8,
				logging: { showWarningToasts: false },
			});

			expect(mockExistsSync).toHaveBeenCalledWith(
				path.join(os.homedir(), ".opencode", "openhax-codex-config.json"),
			);
		});

		it("should load config from file when it exists", () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify({ codexMode: false, enablePromptCaching: true }));

			const config = loadPluginConfig({ forceReload: true });

			expect(config).toEqual({
				codexMode: false,
				enablePromptCaching: true,
				enableCodexCompaction: true,
				autoCompactMinMessages: 8,
				logging: { showWarningToasts: false },
			});
		});

		it("should merge user config with defaults", () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(JSON.stringify({}));

			const config = loadPluginConfig({ forceReload: true });

			expect(config).toEqual({
				codexMode: true,
				enablePromptCaching: true,
				enableCodexCompaction: true,
				autoCompactMinMessages: 8,
				logging: { showWarningToasts: false },
			});
		});

		it("should merge nested logging config with defaults", () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue(
				JSON.stringify({ logging: { enableRequestLogging: false, logMaxFiles: 2 } }),
			);

			const config = loadPluginConfig({ forceReload: true });

			expect(config.logging).toEqual({
				enableRequestLogging: false,
				logMaxFiles: 2,
				showWarningToasts: false,
			});
		});

		it("should handle invalid JSON gracefully", () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockReturnValue("invalid json");

			const logWarnSpy = vi.spyOn(logger, "logWarn").mockImplementation(() => {});
			const config = loadPluginConfig({ forceReload: true });

			expect(config).toEqual({
				codexMode: true,
				enablePromptCaching: true,
				enableCodexCompaction: true,
				autoCompactMinMessages: 8,
				logging: { showWarningToasts: false },
			});
			expect(logWarnSpy).toHaveBeenCalled();
			logWarnSpy.mockRestore();
		});

		it("should handle file read errors gracefully", () => {
			mockExistsSync.mockReturnValue(true);
			mockReadFileSync.mockImplementation(() => {
				throw new Error("Permission denied");
			});

			const logWarnSpy = vi.spyOn(logger, "logWarn").mockImplementation(() => {});
			const config = loadPluginConfig({ forceReload: true });

			expect(config).toEqual({
				codexMode: true,
				enablePromptCaching: true,
				enableCodexCompaction: true,
				autoCompactMinMessages: 8,
				logging: { showWarningToasts: false },
			});
			expect(logWarnSpy).toHaveBeenCalled();
			logWarnSpy.mockRestore();
		});

		it("should memoize config to avoid duplicate filesystem lookups", () => {
			mockExistsSync.mockReturnValue(false);

			const logWarnSpy = vi.spyOn(logger, "logWarn").mockImplementation(() => {});
			const firstLoad = loadPluginConfig({ forceReload: true });

			logWarnSpy.mockClear();
			mockExistsSync.mockClear();
			mockReadFileSync.mockClear();

			const secondLoad = loadPluginConfig();

			expect(secondLoad).toEqual(firstLoad);
			expect(logWarnSpy).not.toHaveBeenCalled();
			expect(mockExistsSync).not.toHaveBeenCalled();
			expect(mockReadFileSync).not.toHaveBeenCalled();

			logWarnSpy.mockRestore();
		});
	});

	describe("getCodexMode", () => {
		it("should return true by default", () => {
			delete process.env.CODEX_MODE;
			const config: PluginConfig = {};

			const result = getCodexMode(config);

			expect(result).toBe(true);
		});

		it("should use config value when env var not set", () => {
			delete process.env.CODEX_MODE;
			const config: PluginConfig = { codexMode: false };

			const result = getCodexMode(config);

			expect(result).toBe(false);
		});

		it("should prioritize env var CODEX_MODE=1 over config", () => {
			process.env.CODEX_MODE = "1";
			const config: PluginConfig = { codexMode: false };

			const result = getCodexMode(config);

			expect(result).toBe(true);
		});

		it("should prioritize env var CODEX_MODE=0 over config", () => {
			process.env.CODEX_MODE = "0";
			const config: PluginConfig = { codexMode: true };

			const result = getCodexMode(config);

			expect(result).toBe(false);
		});

		it('should handle env var with any value other than "1" as false', () => {
			process.env.CODEX_MODE = "false";
			const config: PluginConfig = { codexMode: true };

			const result = getCodexMode(config);

			expect(result).toBe(false);
		});

		it("should use config codexMode=true when explicitly set", () => {
			delete process.env.CODEX_MODE;
			const config: PluginConfig = { codexMode: true };

			const result = getCodexMode(config);

			expect(result).toBe(true);
		});
	});

	describe("Priority order", () => {
		it("should follow priority: env var > config file > default", () => {
			// Test 1: env var overrides config
			process.env.CODEX_MODE = "0";
			expect(getCodexMode({ codexMode: true })).toBe(false);

			// Test 2: config overrides default
			delete process.env.CODEX_MODE;
			expect(getCodexMode({ codexMode: false })).toBe(false);

			// Test 3: default when neither set
			expect(getCodexMode({})).toBe(true);
		});
	});
});
