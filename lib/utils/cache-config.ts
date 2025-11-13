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
 * Cache file names
 */
export const CACHE_FILES = {
	/** Codex instructions file */
	CODEX_INSTRUCTIONS: "codex-instructions.md",
	/** Codex instructions metadata file */
	CODEX_INSTRUCTIONS_META: "codex-instructions-meta.json",
	/** OpenCode prompt file */
	OPENCODE_CODEX: "opencode-codex.txt",
	/** OpenCode prompt metadata file */
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