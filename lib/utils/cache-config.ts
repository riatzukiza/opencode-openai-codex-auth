/**
 * Cache Configuration Constants
 *
 * Centralized cache settings used across the codebase
 */

/**
 * Cache TTL in milliseconds (15 minutes)
 * Used for rate limit protection when checking GitHub for updates
 */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * Cache directory paths
 */
export const CACHE_DIRS = {
	/** Main cache directory */
	CACHE: "cache",
	/** Logs directory */
	LOGS: ["logs", "codex-plugin"],
} as const;

/**
 * Plugin identifier for cache isolation
 */
export const PLUGIN_PREFIX = "openhax-codex";

/**
 * Cache file names with plugin-specific prefix
 */
export const CACHE_FILES = {
	/** Codex instructions file */
	CODEX_INSTRUCTIONS: `${PLUGIN_PREFIX}-instructions.md`,
	/** Codex instructions metadata file */
	CODEX_INSTRUCTIONS_META: `${PLUGIN_PREFIX}-instructions-meta.json`,
	/** OpenCode prompt file */
	OPENCODE_CODEX: `${PLUGIN_PREFIX}-opencode-prompt.txt`,
	/** OpenCode prompt metadata file */
	OPENCODE_CODEX_META: `${PLUGIN_PREFIX}-opencode-prompt-meta.json`,
} as const;

/**
 * Legacy cache file names (for migration)
 */
export const LEGACY_CACHE_FILES = {
	/** Legacy Codex instructions file */
	CODEX_INSTRUCTIONS: "codex-instructions.md",
	/** Legacy Codex instructions metadata file */
	CODEX_INSTRUCTIONS_META: "codex-instructions-meta.json",
	/** Legacy OpenCode prompt file */
	OPENCODE_CODEX: "opencode-codex.txt",
	/** Legacy OpenCode prompt metadata file */
	OPENCODE_CODEX_META: "opencode-codex-meta.json",
} as const;

/**
 * Cache metadata field names
 */
export const CACHE_META_FIELDS = {
	/** ETag header field */
	ETAG: "etag",
	/** Last checked timestamp field */
	LAST_CHECKED: "lastChecked",
	/** Release tag field */
	TAG: "tag",
	/** URL field */
	URL: "url",
} as const;
