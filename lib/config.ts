import type { PluginConfig } from "./types.js";
import { logWarn } from "./logger.js";
import { getOpenCodePath, safeReadFile } from "./utils/file-system-utils.js";

const CONFIG_PATH = getOpenCodePath("openai-codex-auth-config.json");

/**
 * Default plugin configuration
 * CODEX_MODE is enabled by default for better Codex CLI parity
 * Prompt caching is enabled by default to optimize token usage and reduce costs
 */
const DEFAULT_CONFIG: PluginConfig = {
	codexMode: true,
	enablePromptCaching: true,
};

/**
 * Load plugin configuration from ~/.opencode/openai-codex-auth-config.json
 * Falls back to defaults if file doesn't exist or is invalid
 *
 * @returns Plugin configuration
 */
export function loadPluginConfig(): PluginConfig {
	try {
		const fileContent = safeReadFile(CONFIG_PATH);
		if (!fileContent) {
			logWarn("Plugin config file not found, using defaults", { path: CONFIG_PATH });
			return DEFAULT_CONFIG;
		}

		const userConfig = JSON.parse(fileContent) as Partial<PluginConfig>;

		// Merge with defaults
		return {
			...DEFAULT_CONFIG,
			...userConfig,
		};
	} catch (error) {
		logWarn("Failed to load plugin config", {
			path: CONFIG_PATH,
			error: (error as Error).message,
		});
		return DEFAULT_CONFIG;
	}
}

/**
 * Get the effective CODEX_MODE setting
 * Priority: environment variable > config file > default (true)
 *
 * @param pluginConfig - Plugin configuration from file
 * @returns True if CODEX_MODE should be enabled
 */
export function getCodexMode(pluginConfig: PluginConfig): boolean {
	// Environment variable takes precedence
	if (process.env.CODEX_MODE !== undefined) {
		return process.env.CODEX_MODE === "1";
	}

	// Use config setting (defaults to true)
	return pluginConfig.codexMode ?? true;
}
