import type { Auth, Model, Provider } from "@opencode-ai/sdk";

/**
 * Plugin configuration from ~/.opencode/openhax-codex-config.json
 */
export interface PluginConfig {
	/**
	 * Enable CODEX_MODE (Codex-OpenCode bridge prompt instead of tool remap)
	 * @default true
	 */
	codexMode?: boolean;

	/**
	 * Enable prompt caching by maintaining session state across turns
	 * Reduces token usage and costs by preserving conversation context
	 * @default true
	 */
	enablePromptCaching?: boolean;

	/**
	 * Enable Codex-style compaction commands inside the plugin
	 * @default true
	 */
	enableCodexCompaction?: boolean;

	/**
	 * Optional auto-compaction token limit (approximate tokens)
	 */
	autoCompactTokenLimit?: number;

	/**
	 * Minimum number of conversation messages before auto-compacting
	 */
	autoCompactMinMessages?: number;

	/**
	 * Logging configuration that can override environment variables
	 */
	logging?: LoggingConfig;
}

export interface LoggingConfig {
	/** When true, persist detailed request logs regardless of env var */
	enableRequestLogging?: boolean;
	/** When true, enable debug logging regardless of env var */
	debug?: boolean;
	/** Whether warning-level toasts should be shown (default: false) */
	showWarningToasts?: boolean;
	/** Override max bytes before rolling log rotation */
	logMaxBytes?: number;
	/** Override number of rotated log files to keep */
	logMaxFiles?: number;
	/** Override rolling log queue length */
	logQueueMax?: number;
}

/**
 * User configuration structure from opencode.json
 */
export interface UserConfig {
	global: ConfigOptions;
	models: {
		[modelName: string]: {
			options?: ConfigOptions;
		};
	};
}

/**
 * Configuration options for reasoning and text settings
 */
export interface ConfigOptions {
	reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
	reasoningSummary?: "auto" | "concise" | "detailed";
	textVerbosity?: "low" | "medium" | "high";
	include?: string[];
}

/**
 * Reasoning configuration for requests
 */
export interface ReasoningConfig {
	effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
	summary: "auto" | "concise" | "detailed";
}

/**
 * OAuth server information
 */
export interface OAuthServerInfo {
	port: number;
	close: () => void;
	waitForCode: (_state?: string) => Promise<{ code: string } | null>;
}

/**
 * PKCE challenge and verifier
 */
export interface PKCEPair {
	challenge: string;
	verifier: string;
}

/**
 * Authorization flow result
 */
export interface AuthorizationFlow {
	pkce: PKCEPair;
	state: string;
	url: string;
}

/**
 * Token exchange success result
 */
export interface TokenSuccess {
	type: "success";
	access: string;
	refresh: string;
	expires: number;
}

/**
 * Token exchange failure result
 */
export interface TokenFailure {
	type: "failed";
}

/**
 * Token exchange result
 */
export type TokenResult = TokenSuccess | TokenFailure;

/**
 * Parsed authorization input
 */
export interface ParsedAuthInput {
	code?: string;
	state?: string;
}

/**
 * JWT payload with ChatGPT account info
 */
export interface JWTPayload {
	"https://api.openai.com/auth"?: {
		chatgpt_account_id?: string;
	};
	[key: string]: unknown;
}

/**
 * Message input item
 */
export interface InputItem {
	id?: string;
	type: string;
	role: string;
	content?: unknown;
	[key: string]: unknown;
}

/**
 * Request body structure
 */
export interface RequestBody {
	model: string;
	store?: boolean;
	stream?: boolean;
	instructions?: string;
	input?: InputItem[];
	tools?: unknown;
	/** OpenAI Responses API tool selection policy */
	tool_choice?: string | { type?: string };
	/** Whether the model may call tools in parallel during a single turn */
	parallel_tool_calls?: boolean;
	reasoning?: Partial<ReasoningConfig>;
	text?: {
		verbosity?: "low" | "medium" | "high";
	};
	include?: string[];
	metadata?: Record<string, unknown>;
	/** Stable key to enable prompt-token caching on Codex backend */
	prompt_cache_key?: string;
	max_output_tokens?: number;
	max_completion_tokens?: number;
	[key: string]: unknown;
}

/**
 * SSE event data structure
 */
export interface SSEEventData {
	type: string;
	response?: unknown;
	[key: string]: unknown;
}

/**
 * Internal session information for prompt caching
 */
export interface SessionState {
	id: string;
	promptCacheKey: string;
	store: boolean;
	lastInput: InputItem[];
	lastPrefixHash: string | null;
	lastUpdated: number;
	lastCachedTokens?: number;
	bridgeInjected?: boolean; // Track whether Codex-OpenCode bridge prompt was added
	compactionBaseSystem?: InputItem[];
	compactionSummaryItem?: InputItem;
}

/**
 * Context returned by the session manager for a specific request
 */
export interface SessionContext {
	sessionId: string;
	enabled: boolean;
	preserveIds: boolean;
	isNew: boolean;
	state: SessionState;
}

/**
 * Minimal Codex response payload used for session updates
 */
export interface CodexResponsePayload {
	usage?: {
		cached_tokens?: number;
		[k: string]: unknown;
	};
	output?: unknown[];
	items?: unknown[];
	[key: string]: unknown;
}

/**
 * Cache metadata for Codex instructions
 */
export interface CacheMetadata {
	etag?: string;
	tag: string;
	lastChecked: number;
	url: string;
}

/**
 * GitHub release data
 */
export interface GitHubRelease {
	tag_name: string;
	[key: string]: unknown;
}

// Re-export SDK types for convenience
export type { Auth, Provider, Model };
