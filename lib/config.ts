import { logWarn } from "./logger.js";
import type { PluginConfig } from "./types.js";
import { getOpenCodePath, safeReadFile } from "./utils/file-system-utils.js";

const CONFIG_PATH = getOpenCodePath("openhax-codex-config.json");

/**
 * Default plugin configuration
 * CODEX_MODE is enabled by default for better Codex CLI parity
 * Prompt caching is enabled by default to optimize token usage and reduce costs
 */
function getDefaultConfig(): PluginConfig {
	return {
		codexMode: true,
		enablePromptCaching: true,
		appendEnvContext: process.env.CODEX_APPEND_ENV_CONTEXT === "1",
		logging: {
			showWarningToasts: false,
			logWarningsToConsole: false,
		},
	};
}

let cachedPluginConfig: PluginConfig | undefined;

/**
 * Load plugin configuration from ~/.opencode/openhax-codex-config.json
 * Falls back to defaults if file doesn't exist or is invalid
 *
 * @returns Plugin configuration
 */
export function loadPluginConfig(options: { forceReload?: boolean } = {}): PluginConfig {
	const { forceReload } = options;

	if (forceReload) {
		cachedPluginConfig = undefined;
	}

	if (cachedPluginConfig) {
		return cachedPluginConfig;
	}

	try {
		const defaults = getDefaultConfig();
		const fileContent = safeReadFile(CONFIG_PATH);
		if (!fileContent) {
			logWarn("Plugin config file not found, using defaults", { path: CONFIG_PATH });
			cachedPluginConfig = { ...defaults };
			return cachedPluginConfig;
		}

		const userConfig = JSON.parse(fileContent) as Partial<PluginConfig>;
		const userLogging = userConfig.logging ?? {};

		// Merge with defaults (shallow merge + nested logging merge)
		cachedPluginConfig = {
			...defaults,
			...userConfig,
			logging: {
				...defaults.logging,
				...userLogging,
			},
		};
		return cachedPluginConfig;
	} catch (error) {
		const defaults = getDefaultConfig();
		logWarn("Failed to load plugin config", {
			path: CONFIG_PATH,
			error: (error as Error).message,
		});
		cachedPluginConfig = { ...defaults };
		return cachedPluginConfig;
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
