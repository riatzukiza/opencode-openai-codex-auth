import { logDebug, logWarn } from "../logger.js";
import { TOOL_REMAP_MESSAGE } from "../prompts/codex.js";
import { createHash, randomUUID } from "node:crypto";
import { CODEX_OPENCODE_BRIDGE } from "../prompts/codex-opencode-bridge.js";
import { getOpenCodeCodexPrompt } from "../prompts/opencode-codex.js";
import {
	approximateTokenCount,
	buildCompactionPromptItems,
	collectSystemMessages,
	serializeConversation,
} from "../compaction/codex-compaction.js";
import type { CompactionDecision } from "../compaction/compaction-executor.js";
import { 
	generateInputHash, 
	generateContentHash,
	hasBridgePromptInConversation, 
	getCachedBridgeDecision, 
	cacheBridgeDecision 
} from "../cache/prompt-fingerprinting.js";
import type {
	ConfigOptions,
	InputItem,
	ReasoningConfig,
	RequestBody,
	SessionContext,
	UserConfig,
} from "../types.js";

function cloneInputItem<T extends Record<string, unknown>>(item: T): T {
	return JSON.parse(JSON.stringify(item)) as T;
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	const entries = Object.keys(value as Record<string, unknown>)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);

	return `{${entries.join(",")}}`;
}

function computePayloadHash(item: InputItem): string {
	const canonical = stableStringify(item);
	return createHash("sha1").update(canonical).digest("hex");
}

export interface ConversationCacheEntry {
	hash: string;
	callId?: string;
	lastUsed: number;
}

export interface ConversationMemory {
	entries: Map<string, ConversationCacheEntry>;
	payloads: Map<string, InputItem>;
	usage: Map<string, number>;
}

const CONVERSATION_ENTRY_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CONVERSATION_MAX_ENTRIES = 1000;

function decrementUsage(memory: ConversationMemory, hash: string): void {
	const current = memory.usage.get(hash) ?? 0;
	if (current <= 1) {
		memory.usage.delete(hash);
		memory.payloads.delete(hash);
	} else {
		memory.usage.set(hash, current - 1);
	}
}

function incrementUsage(memory: ConversationMemory, hash: string, payload: InputItem): void {
	const current = memory.usage.get(hash) ?? 0;
	if (current === 0) {
		memory.payloads.set(hash, payload);
	}
	memory.usage.set(hash, current + 1);
}

function storeConversationEntry(
	memory: ConversationMemory,
	id: string,
	item: InputItem,
	callId: string | undefined,
	timestamp: number,
): void {
	const sanitized = cloneInputItem(item);
	const hash = computePayloadHash(sanitized);
	const existing = memory.entries.get(id);

	if (existing && existing.hash === hash) {
		existing.lastUsed = timestamp;
		if (callId && !existing.callId) {
			existing.callId = callId;
		}
		return;
	}

	if (existing) {
		decrementUsage(memory, existing.hash);
	}

	incrementUsage(memory, hash, sanitized);
	memory.entries.set(id, { hash, callId, lastUsed: timestamp });
}

function removeConversationEntry(memory: ConversationMemory, id: string): void {
	const existing = memory.entries.get(id);
	if (!existing) return;
	memory.entries.delete(id);
	decrementUsage(memory, existing.hash);
}

function pruneConversationMemory(
	memory: ConversationMemory,
	timestamp: number,
	protectedIds: Set<string>,
): void {
	for (const [id, entry] of memory.entries.entries()) {
		if (timestamp - entry.lastUsed > CONVERSATION_ENTRY_TTL_MS && !protectedIds.has(id)) {
			removeConversationEntry(memory, id);
		}
	}

	if (memory.entries.size <= CONVERSATION_MAX_ENTRIES) {
		return;
	}

	const candidates = Array.from(memory.entries.entries())
		.filter(([id]) => !protectedIds.has(id))
		.sort((a, b) => a[1].lastUsed - b[1].lastUsed);

	for (const [id] of candidates) {
		if (memory.entries.size <= CONVERSATION_MAX_ENTRIES) break;
		removeConversationEntry(memory, id);
	}

	if (memory.entries.size > CONVERSATION_MAX_ENTRIES) {
		const fallback = Array.from(memory.entries.entries())
			.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
		for (const [id] of fallback) {
			if (memory.entries.size <= CONVERSATION_MAX_ENTRIES) break;
			removeConversationEntry(memory, id);
		}
	}
}
/**
 * Normalize incoming tools into the exact JSON shape the Codex CLI emits.
 * Handles strings, CLI-style objects, AI SDK nested objects, and boolean maps.
 */
function normalizeToolsForResponses(tools: unknown): any[] | undefined {
	if (!tools) return undefined;

	const defaultFunctionParameters = {
		type: "object",
		properties: {},
		additionalProperties: true,
	};

	const defaultFreeformFormat = {
		type: "json_schema/v1",
		syntax: "json",
		definition: "{}",
	};

	const isNativeCodexTool = (value: unknown): value is "shell" | "apply_patch" => {
		return typeof value === "string" && (value === "shell" || value === "apply_patch");
	};

	const makeFunctionTool = (
		name: unknown,
		description?: unknown,
		parameters?: unknown,
		strict?: unknown,
	) => {
		if (typeof name !== "string" || !name.trim()) return undefined;
		const tool: Record<string, unknown> = {
			type: "function",
			name,
			strict: typeof strict === "boolean" ? strict : false,
			parameters:
				parameters && typeof parameters === "object"
					? parameters
					: defaultFunctionParameters,
		};
		if (typeof description === "string" && description.trim()) {
			tool.description = description;
		}
		return tool;
	};

	const makeFreeformTool = (
		name: unknown,
		description?: unknown,
		format?: unknown,
	) => {
		if (typeof name !== "string" || !name.trim()) return undefined;
		const tool: Record<string, unknown> = {
			type: "custom",
			name,
			format:
				format && typeof format === "object"
					? format
					: defaultFreeformFormat,
		};
		if (typeof description === "string" && description.trim()) {
			tool.description = description;
		}
		return tool;
	};

	const convertTool = (candidate: unknown): any | undefined => {
		if (!candidate) return undefined;
		if (typeof candidate === "string") {
			const trimmed = candidate.trim();
			if (isNativeCodexTool(trimmed)) {
				return { type: trimmed };
			}
			return makeFunctionTool(trimmed);
		}
		if (typeof candidate !== "object") {
			return undefined;
		}
		const obj = candidate as Record<string, unknown>;
		const nestedFn =
			obj.function && typeof obj.function === "object"
				? (obj.function as Record<string, unknown>)
				: undefined;
		const type = typeof obj.type === "string" ? obj.type : undefined;
		if (type && isNativeCodexTool(type)) {
			return { type };
		}
		if (type === "function") {
			return makeFunctionTool(
				nestedFn?.name ?? obj.name,
				nestedFn?.description ?? obj.description,
				nestedFn?.parameters ?? obj.parameters,
				nestedFn?.strict ?? obj.strict,
			);
		}
		if (type === "custom") {
			return makeFreeformTool(
				nestedFn?.name ?? obj.name,
				nestedFn?.description ?? obj.description,
				nestedFn?.format ?? obj.format,
			);
		}
		if (type === "local_shell" || type === "web_search") {
			// These variants do not require additional fields.
			return { type };
		}
		if (typeof obj.name === "string") {
			if (isNativeCodexTool(obj.name)) {
				return { type: obj.name };
			}
			return makeFunctionTool(obj.name, obj.description, obj.parameters, obj.strict);
		}
		if (nestedFn?.name) {
			return makeFunctionTool(
				nestedFn.name,
				nestedFn.description,
				nestedFn.parameters,
				nestedFn.strict,
			);
		}
		return undefined;
	};

	if (Array.isArray(tools)) {
		return tools.map(convertTool).filter(Boolean) as any[];
	}

	if (typeof tools === "object") {
		return Object.entries(tools as Record<string, unknown>)
			.map(([name, value]) => {
				if (value && typeof value === "object") {
					const record = value as Record<string, unknown>;
					const enabled = record.enabled ?? record.use ?? record.allow ?? true;
					if (!enabled) return undefined;
					if (record.type === "custom") {
						return makeFreeformTool(name, record.description, record.format);
					}
					return makeFunctionTool(
						name,
						record.description,
						record.parameters,
						record.strict,
					);
				}
				if (value === true) {
					return makeFunctionTool(name);
				}
				return undefined;
			})
			.filter(Boolean) as any[];
	}

	return undefined;
}


/**
 * Normalize model name to Codex-supported variants
 * @param model - Original model name
 * @returns Normalized model name
 */
export function normalizeModel(model: string | undefined): string {
	const fallback = "gpt-5.1";
	if (!model) return fallback;

	const lowered = model.toLowerCase();
	const sanitized = lowered.replace(/\./g, "-").replace(/[\s_\/]+/g, "-");

	const contains = (needle: string) => sanitized.includes(needle);
	const hasGpt51 = contains("gpt-5-1") || sanitized.includes("gpt51");

	if (contains("gpt-5-1-codex-mini") || (hasGpt51 && contains("codex-mini"))) {
		return "gpt-5.1-codex-mini";
	}
	if (contains("codex-mini")) {
		return "gpt-5.1-codex-mini";
	}
	if (contains("gpt-5-1-codex") || (hasGpt51 && contains("codex"))) {
		return "gpt-5.1-codex";
	}
	if (hasGpt51) {
		return "gpt-5.1";
	}
	if (contains("gpt-5-codex-mini") || contains("codex-mini-latest")) {
		return "gpt-5.1-codex-mini";
	}
	if (contains("gpt-5-codex") || (contains("codex") && !contains("mini"))) {
		return "gpt-5-codex";
	}
	if (contains("gpt-5")) {
		return "gpt-5";
	}

	return fallback;
}

/**
 * Extract configuration for a specific model
 * Merges global options with model-specific options (model-specific takes precedence)
 * @param modelName - Model name (e.g., "gpt-5-codex")
 * @param userConfig - Full user configuration object
 * @returns Merged configuration for this model
 */
export function getModelConfig(
	modelName: string,
	userConfig: UserConfig = { global: {}, models: {} },
): ConfigOptions {
	const globalOptions = userConfig.global || {};
	const modelOptions = userConfig.models?.[modelName]?.options || {};

	// Model-specific options override global options
	return { ...globalOptions, ...modelOptions };
}

/**
 * Configure reasoning parameters based on model variant and user config
 *
 * NOTE: This plugin follows Codex CLI defaults instead of opencode defaults because:
 * - We're accessing the ChatGPT backend API (not OpenAI Platform API)
 * - opencode explicitly excludes gpt-5-codex from automatic reasoning configuration
 * - Codex CLI has been thoroughly tested against this backend
 *
 * @param originalModel - Original model name before normalization
 * @param userConfig - User configuration object
 * @returns Reasoning configuration
 */
export function getReasoningConfig(
	originalModel: string | undefined,
	userConfig: ConfigOptions = {},
): ReasoningConfig {
	const normalized = normalizeModel(originalModel);
	const normalizedOriginal = originalModel?.toLowerCase() ?? normalized;
	const isGpt51 = normalized.startsWith("gpt-5.1");
	const isCodexMiniSlug = normalized === "gpt-5.1-codex-mini" || normalized === "codex-mini-latest";
	const isLegacyCodexMini = normalizedOriginal.includes("codex-mini-latest");
	const isCodexMini =
		isCodexMiniSlug ||
		isLegacyCodexMini ||
		normalizedOriginal.includes("codex-mini") ||
		normalizedOriginal.includes("codex mini") ||
		normalizedOriginal.includes("codex_mini");
	const isCodexFamily =
		normalized.startsWith("gpt-5-codex") ||
		normalized.startsWith("gpt-5.1-codex") ||
		(normalizedOriginal.includes("codex") && !isCodexMini);
	const isLightweight =
		!isCodexMini &&
		!isCodexFamily &&
		(normalizedOriginal.includes("nano") || normalizedOriginal.includes("mini"));

	let defaultEffort: ReasoningConfig["effort"];
	if (isGpt51 && !isCodexFamily && !isCodexMini) {
		defaultEffort = "none";
	} else if (isCodexMini) {
		defaultEffort = "medium";
	} else if (isLightweight) {
		defaultEffort = "minimal";
	} else {
		defaultEffort = "medium";
	}

	let effort = userConfig.reasoningEffort || defaultEffort;

	if (isCodexMini) {
		if (effort === "minimal" || effort === "low" || effort === "none") {
			effort = "medium";
		}
		if (effort !== "high") {
			effort = "medium";
		}
	} else if (isCodexFamily) {
		if (effort === "minimal" || effort === "none") {
			effort = "low";
		}
	} else if (isGpt51 && effort === "minimal") {
		effort = "none";
	} else if (!isGpt51 && effort === "none") {
		effort = "minimal";
	}

	return {
		effort,
		summary: userConfig.reasoningSummary || "auto",
	};
}

/**
 * Filter input array for stateless Codex API (store: false)
 *
 * Two transformations needed:
 * 1. Remove AI SDK-specific items (not supported by Codex API)
 * 2. Strip IDs from all remaining items (stateless mode)
 *
 * AI SDK constructs to REMOVE (not in OpenAI Responses API spec):
 * - type: "item_reference" - AI SDK uses this for server-side state lookup
 *
 * Items to KEEP (strip IDs):
 * - type: "message" - Conversation messages (provides context to LLM)
 * - type: "function_call" - Tool calls from conversation
 * - type: "function_call_output" - Tool results from conversation
 *
 * Context is maintained through:
 * - Full message history (without IDs)
 * - reasoning.encrypted_content (for reasoning continuity)
 *
 * @param input - Original input array from OpenCode/AI SDK
 * @returns Filtered input array compatible with Codex API
 */
export function filterInput(
	input: InputItem[] | undefined,
	options: { preserveIds?: boolean } = {},
): InputItem[] | undefined {
	if (!Array.isArray(input)) return input;

	const { preserveIds = false } = options;

	return input
		.filter((item) => {
			// Remove AI SDK constructs not supported by Codex API
			if (item.type === "item_reference") {
				return false; // AI SDK only - references server state
			}
			return true; // Keep all other items
		})
		.map((item) => {
			let sanitized = item as InputItem;

			// Strip IDs from all items (Codex API stateless mode)
			if (item.id && !preserveIds) {
				const { id: _id, ...itemWithoutId } = item as Record<string, unknown> & InputItem;
				sanitized = itemWithoutId as InputItem;
			}

			// Remove metadata to keep prefixes stable across environments
			if (!preserveIds && "metadata" in (sanitized as Record<string, unknown>)) {
				const { metadata: _metadata, ...rest } = sanitized as Record<string, unknown>;
				sanitized = rest as InputItem;
			}

			return sanitized;
		});
}

/**
 * Check if an input item is the OpenCode system prompt
 * Uses cached OpenCode codex.txt for verification with fallback to text matching
 * @param item - Input item to check
 * @param cachedPrompt - Cached OpenCode codex.txt content
 * @returns True if this is the OpenCode system prompt
 */
export function isOpenCodeSystemPrompt(
	item: InputItem,
	cachedPrompt: string | null,
): boolean {
	const isSystemRole = item.role === "developer" || item.role === "system";
	if (!isSystemRole) return false;

	const getContentText = (item: InputItem): string => {
		if (typeof item.content === "string") {
			return item.content;
		}
		if (Array.isArray(item.content)) {
			return item.content
				.filter((c) => c.type === "input_text" && c.text)
				.map((c) => c.text)
				.join("\n");
		}
		return "";
	};

	const contentText = getContentText(item);
	if (!contentText) return false;

	// Primary check: Compare against cached OpenCode prompt
	if (cachedPrompt) {
		// Exact match (trim whitespace for comparison)
		if (contentText.trim() === cachedPrompt.trim()) {
			return true;
		}

		// Partial match: Check if first 200 chars match (handles minor variations)
		const contentPrefix = contentText.trim().substring(0, 200);
		const cachedPrefix = cachedPrompt.trim().substring(0, 200);
		if (contentPrefix === cachedPrefix) {
			return true;
		}
	}

	// Fallback check: Known OpenCode prompt signature (for safety)
	// This catches the prompt even if cache fails
	return contentText.startsWith("You are a coding agent running in");
}

/**
 * Filter out OpenCode system prompts from input
 * Used in CODEX_MODE to replace OpenCode prompts with Codex-OpenCode bridge
 * Also strips OpenCode's auto-compaction summary instructions that reference
 * a non-existent "summary file" path in stateless mode.
 * @param input - Input array
 * @returns Input array without OpenCode system or compaction prompts
 */
export async function filterOpenCodeSystemPrompts(
	input: InputItem[] | undefined,
): Promise<InputItem[] | undefined> {
	if (!Array.isArray(input)) return input;

	// Fetch cached OpenCode prompt for verification
	let cachedPrompt: string | null = null;
	try {
		cachedPrompt = await getOpenCodeCodexPrompt();
	} catch {
		// If fetch fails, fallback to text-based detection only
		// This is safe because we still have the "starts with" check
	}

	// Heuristic detector for OpenCode auto-compaction prompts that instruct
	// saving/reading a conversation summary from a file path.
	const compactionInstructionPatterns: RegExp[] = [
		/(summary[ _-]?file)/i,
		/(summary[ _-]?path)/i,
		/summary\s+(?:has\s+been\s+)?saved\s+(?:to|at)/i,
		/summary\s+(?:is\s+)?stored\s+(?:in|at|to)/i,
		/summary\s+(?:is\s+)?available\s+(?:at|in)/i,
		/write\s+(?:the\s+)?summary\s+(?:to|into)/i,
		/save\s+(?:the\s+)?summary\s+(?:to|into)/i,
		/open\s+(?:the\s+)?summary/i,
		/read\s+(?:the\s+)?summary/i,
		/cat\s+(?:the\s+)?summary/i,
		/view\s+(?:the\s+)?summary/i,
		/~\/\.opencode/i,
		/\.opencode\/.*summary/i,
	];

	const getCompactionText = (it: InputItem): string => {
		if (typeof it.content === "string") return it.content;
		if (Array.isArray(it.content)) {
			return it.content
				.filter((c: any) => c && c.type === "input_text" && c.text)
				.map((c: any) => c.text)
				.join("\n");
		}
		return "";
	};

	const matchesCompactionInstruction = (value: string): boolean =>
		compactionInstructionPatterns.some((pattern) => pattern.test(value));

	const sanitizeOpenCodeCompactionPrompt = (item: InputItem): InputItem | null => {
		const text = getCompactionText(item);
		if (!text) return null;
		const sanitizedText = text
			.split(/\r?\n/)
			.map((line) => line.trimEnd())
			.filter((line) => {
				const trimmed = line.trim();
				if (!trimmed) {
					return true;
				}
				return !matchesCompactionInstruction(trimmed);
			})
			.join("\n")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
		if (!sanitizedText) {
			return null;
		}
		const originalMentionedCompaction = /\bauto[-\s]?compaction\b/i.test(text);
		let finalText = sanitizedText;
		if (originalMentionedCompaction && !/\bauto[-\s]?compaction\b/i.test(finalText)) {
			finalText = `Auto-compaction summary\n\n${finalText}`;
		}
		return {
			...item,
			content: finalText,
		};
	};

	const isOpenCodeCompactionPrompt = (item: InputItem): boolean => {
		const isSystemRole = item.role === "developer" || item.role === "system";
		if (!isSystemRole) return false;
		const text = getCompactionText(item);
		if (!text) return false;
		const hasCompaction = /\b(auto[-\s]?compaction|compaction|compact)\b/i.test(text);
		const hasSummary = /\b(summary|summarize|summarise)\b/i.test(text);
		return hasCompaction && hasSummary && matchesCompactionInstruction(text);
	};

	const filteredInput: InputItem[] = [];
	for (const item of input) {
		// Keep user messages
		if (item.role === "user") {
			filteredInput.push(item);
			continue;
		}

		// Filter out OpenCode system prompts entirely
		if (isOpenCodeSystemPrompt(item, cachedPrompt)) {
			continue;
		}

		if (isOpenCodeCompactionPrompt(item)) {
			const sanitized = sanitizeOpenCodeCompactionPrompt(item);
			if (sanitized) {
				filteredInput.push(sanitized);
			}
			continue;
		}

		filteredInput.push(item);
	}

	return filteredInput;
}

/**
 * Analyze if bridge prompt is needed based on tools and conversation context
 * @param input - Input array
 * @param hasTools - Whether tools are present in request
 * @returns Object with analysis results
 */
function analyzeBridgeRequirement(
	input: InputItem[] | undefined,
	hasTools: boolean
): { needsBridge: boolean; reason: string; toolCount: number } {
	if (!hasTools || !Array.isArray(input)) {
		return { needsBridge: false, reason: "no_tools_or_input", toolCount: 0 };
	}

	// For now, be more permissive - if tools are present, assume bridge is needed
	// This maintains backward compatibility with existing tests
	// Future optimization can make this more sophisticated
	const toolCount = 1; // Simple heuristic
	
	return { 
		needsBridge: true, 
		reason: "tools_present",
		toolCount 
	};
}

/**
 * Add Codex-OpenCode bridge message to input if tools are present
 * Uses session-scoped tracking to ensure bridge is only injected once per session
 * @param input - Input array
 * @param hasTools - Whether tools are present in request
 * @param sessionContext - Optional session context for tracking bridge injection
 * @returns Input array with bridge message prepended if needed
 */
export function addCodexBridgeMessage(
	input: InputItem[] | undefined,
	hasTools: boolean,
	sessionContext?: SessionContext,
): InputItem[] | undefined {
	if (!Array.isArray(input)) return input;

	// Generate input hash for caching
	const inputHash = generateInputHash(input);
	
	// Analyze bridge requirement
	const analysis = analyzeBridgeRequirement(input, hasTools);
	
	// Check session-level bridge injection flag first
	if (sessionContext?.state.bridgeInjected) {
		logDebug("Bridge prompt already injected in session, skipping injection");
		return input;
	}
	
	// Check cache first
	const cachedDecision = getCachedBridgeDecision(inputHash, analysis.toolCount);
	if (cachedDecision) {
		logDebug(`Using cached bridge decision: ${cachedDecision.hash === generateContentHash("add") ? "add" : "skip"}`);
		return cachedDecision.hash === generateContentHash("add") 
			? [{ type: "message", role: "developer", content: [{ type: "input_text", text: CODEX_OPENCODE_BRIDGE }] }, ...input]
			: input;
	}

	// Check if bridge prompt is already in conversation (fallback)
	if (hasBridgePromptInConversation(input, CODEX_OPENCODE_BRIDGE)) {
		logDebug("Bridge prompt already present in conversation, skipping injection");
		cacheBridgeDecision(inputHash, analysis.toolCount, false);
		return input;
	}

	// Apply conditional logic
	if (!analysis.needsBridge) {
		logDebug(`Skipping bridge prompt: ${analysis.reason} (tools: ${analysis.toolCount})`);
		cacheBridgeDecision(inputHash, analysis.toolCount, false);
		return input;
	}

	logDebug(`Adding bridge prompt: ${analysis.reason} (tools: ${analysis.toolCount})`);
	cacheBridgeDecision(inputHash, analysis.toolCount, true);

	// Mark bridge as injected in session state
	if (sessionContext) {
		sessionContext.state.bridgeInjected = true;
	}

	const bridgeMessage: InputItem = {
		type: "message",
		role: "developer",
		content: [
			{
				type: "input_text",
				text: CODEX_OPENCODE_BRIDGE,
			},
		],
	};

	return [bridgeMessage, ...input];
}

/**
 * Add tool remapping message to input if tools are present
 * @param input - Input array
 * @param hasTools - Whether tools are present in request
 * @returns Input array with tool remap message prepended if needed
 */
export function addToolRemapMessage(
	input: InputItem[] | undefined,
	hasTools: boolean,
): InputItem[] | undefined {
	if (!hasTools || !Array.isArray(input)) return input;

	const toolRemapMessage: InputItem = {
		type: "message",
		role: "developer",
		content: [
			{
				type: "input_text",
				text: TOOL_REMAP_MESSAGE,
			},
		],
	};

	return [toolRemapMessage, ...input];
}

function maybeBuildCompactionPrompt(
	originalInput: InputItem[],
	commandText: string | null,
	settings: { enabled: boolean; autoLimitTokens?: number; autoMinMessages?: number },
): { items: InputItem[]; decision: CompactionDecision } | null {
	if (!settings.enabled) {
		return null;
	}
	const conversationSource = commandText
		? removeLastUserMessage(originalInput)
		: cloneConversationItems(originalInput);
	const turnCount = countConversationTurns(conversationSource);
	let trigger: "command" | "auto" | null = null;
	let reason: string | undefined;
	let approxTokens: number | undefined;

	if (commandText) {
		trigger = "command";
	} else if (settings.autoLimitTokens && settings.autoLimitTokens > 0) {
		approxTokens = approximateTokenCount(conversationSource);
		const minMessages = settings.autoMinMessages ?? 8;
		if (approxTokens >= settings.autoLimitTokens && turnCount >= minMessages) {
			trigger = "auto";
			reason = `~${approxTokens} tokens >= limit ${settings.autoLimitTokens}`;
		}
	}

	if (!trigger) {
		return null;
	}

	const serialization = serializeConversation(conversationSource);
	const promptItems = buildCompactionPromptItems(serialization.transcript);

	return {
		items: promptItems,
		decision: {
			mode: trigger,
			reason,
			approxTokens,
			preservedSystem: collectSystemMessages(originalInput),
			serialization,
		},
	};
}

function cloneConversationItems(items: InputItem[]): InputItem[] {
	return items.map((item) => cloneInputItem(item));
}

function removeLastUserMessage(items: InputItem[]): InputItem[] {
	const cloned = cloneConversationItems(items);
	for (let index = cloned.length - 1; index >= 0; index -= 1) {
		if (cloned[index]?.role === "user") {
			cloned.splice(index, 1);
			break;
		}
	}
	return cloned;
}

function countConversationTurns(items: InputItem[]): number {
	return items.filter((item) => item.role === "user" || item.role === "assistant").length;
}

const PROMPT_CACHE_METADATA_KEYS = [
	"conversation_id",
	"conversationId",
	"thread_id",
	"threadId",
	"session_id",
	"sessionId",
	"chat_id",
	"chatId",
];

type PromptCacheKeySource = "existing" | "metadata" | "generated";

interface PromptCacheKeyResult {
	key: string;
	source: PromptCacheKeySource;
	sourceKey?: string;
}

function extractString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function derivePromptCacheKeyFromBody(body: RequestBody): { value: string; sourceKey: string } | undefined {
	const metadata = body.metadata as Record<string, unknown> | undefined;
	const root = body as Record<string, unknown>;

	const getForkIdentifier = (): string | undefined => {
		// Prefer metadata over root, and support both camelCase and snake_case
		return (
			extractString(metadata?.forkId) ||
			extractString(metadata?.fork_id) ||
			extractString(metadata?.branchId) ||
			extractString(metadata?.branch_id) ||
			extractString(root.forkId) ||
			extractString(root.fork_id) ||
			extractString(root.branchId) ||
			extractString(root.branch_id)
		);
	};

	const forkId = getForkIdentifier();

	for (const key of PROMPT_CACHE_METADATA_KEYS) {
		const base = extractString(metadata?.[key]) ?? extractString(root[key]);
		if (base) {
			const value = forkId ? `${base}::fork::${forkId}` : base;
			return { value, sourceKey: key };
		}
	}
	return undefined;
}

function generatePromptCacheKey(): string {
	return `cache_${randomUUID()}`;
}

function ensurePromptCacheKey(body: RequestBody): PromptCacheKeyResult {
	const hostBody = body as Record<string, unknown>;
	const existingSnake = extractString(hostBody.prompt_cache_key);
	const existingCamel = extractString(hostBody.promptCacheKey);
	const existing = existingSnake || existingCamel;
	
	if (existing) {
		// Codex backend expects snake_case, so always set prompt_cache_key
		// Preserve the camelCase field for OpenCode if it was provided
		body.prompt_cache_key = existing;
		if (existingCamel) {
			hostBody.promptCacheKey = existingCamel; // preserve OpenCode's field
		}
		return { key: existing, source: "existing" };
	}

	const derived = derivePromptCacheKeyFromBody(body);
	if (derived) {
		const sanitized = extractString(derived.value) ?? generatePromptCacheKey();
		body.prompt_cache_key = sanitized;
		// Don't set camelCase field for derived keys - only snake_case for Codex
		return { key: sanitized, source: "metadata", sourceKey: derived.sourceKey };
	}

	const generated = generatePromptCacheKey();
	body.prompt_cache_key = generated;
	// Don't set camelCase field for generated keys - only snake_case for Codex
	return { key: generated, source: "generated" };
}

/**
 * Transform request body for Codex API
 *
 * NOTE: Configuration follows Codex CLI patterns instead of opencode defaults:
 * - opencode sets textVerbosity="low" for gpt-5, but Codex CLI uses "medium"
 * - opencode excludes gpt-5-codex from reasoning configuration
 * - This plugin uses store=false (stateless), requiring encrypted reasoning content
 */
interface TransformRequestOptions {
	preserveIds?: boolean;
	compaction?: {
		settings: {
			enabled: boolean;
			autoLimitTokens?: number;
			autoMinMessages?: number;
		};
		commandText: string | null;
		originalInput: InputItem[];
	};
}

interface TransformResult {
	body: RequestBody;
	compactionDecision?: CompactionDecision;
}

export async function transformRequestBody(
	body: RequestBody,
	codexInstructions: string,
	userConfig: UserConfig = { global: {}, models: {} },
	codexMode = true,
	options: TransformRequestOptions = {},
	sessionContext?: SessionContext,
): Promise<TransformResult> {
	const originalModel = body.model;
	const normalizedModel = normalizeModel(body.model);
	const preserveIds = options.preserveIds ?? false;

	let compactionDecision: CompactionDecision | undefined;
	const compactionOptions = options.compaction;
	if (compactionOptions?.settings.enabled) {
		const compactionBuild = maybeBuildCompactionPrompt(
			compactionOptions.originalInput,
			compactionOptions.commandText,
			compactionOptions.settings,
		);
		if (compactionBuild) {
			body.input = compactionBuild.items;
			delete (body as any).tools;
			delete (body as any).tool_choice;
			delete (body as any).parallel_tool_calls;
			compactionDecision = compactionBuild.decision;
		}
	}
	const skipConversationTransforms = Boolean(compactionDecision);

	// Get model-specific configuration using ORIGINAL model name (config key)
	// This allows per-model options like "gpt-5-codex-low" to work correctly
	const lookupModel = originalModel || normalizedModel;
	const modelConfig = getModelConfig(lookupModel, userConfig);

	// Debug: Log which config was resolved
	logDebug(
		`Model config lookup: "${lookupModel}" → normalized to "${normalizedModel}" for API`,
		{
			hasModelSpecificConfig: !!userConfig.models?.[lookupModel],
			resolvedConfig: modelConfig,
		},
	);

	// Normalize model name for API call
	body.model = normalizedModel;

	// Codex required fields
	// ChatGPT backend REQUIRES store=false (confirmed via testing)
	body.store = false;
	body.stream = true;
	body.instructions = codexInstructions;

	// Prompt caching relies on the host or SessionManager providing a stable
	// prompt_cache_key. We accept both camelCase (promptCacheKey) and
	// snake_case (prompt_cache_key) inputs from the host/runtime.

	// Ensure prompt_cache_key is set using our robust logic
	const cacheKeyResult = ensurePromptCacheKey(body);
	if (cacheKeyResult.source === "existing") {
		// Host provided a valid cache key, use it as-is
	} else if (cacheKeyResult.source === "metadata") {
		logDebug("Prompt cache key missing; derived from metadata", {
			promptCacheKey: cacheKeyResult.key,
			sourceKey: cacheKeyResult.sourceKey,
		});
	} else if (cacheKeyResult.source === "generated") {
		logWarn("Prompt cache key missing; generated fallback cache key", {
			promptCacheKey: cacheKeyResult.key,
		});
	}

	// Tool behavior parity with Codex CLI (normalize shapes)
	let hasNormalizedTools = false;
	if (skipConversationTransforms) {
		delete (body as any).tools;
		delete (body as any).tool_choice;
		delete (body as any).parallel_tool_calls;
	} else if (body.tools) {
		const normalizedTools = normalizeToolsForResponses(body.tools);
		if (normalizedTools && normalizedTools.length > 0) {
			(body as any).tools = normalizedTools;
			(body as any).tool_choice = "auto";
			const modelName = (body.model || "").toLowerCase();
			const codexParallelDisabled =
				modelName.includes("gpt-5-codex") || modelName.includes("gpt-5.1-codex");
			(body as any).parallel_tool_calls = !codexParallelDisabled;
			hasNormalizedTools = true;
		} else {
			delete (body as any).tools;
			delete (body as any).tool_choice;
			delete (body as any).parallel_tool_calls;
		}
	}

	// Filter and transform input
	if (body.input && Array.isArray(body.input) && !skipConversationTransforms) {
		// Debug: Log original input message IDs before filtering
		const originalIds = body.input
			.filter((item) => item.id)
			.map((item) => item.id);
		if (originalIds.length > 0) {
			logDebug(
				`Filtering ${originalIds.length} message IDs from input:`,
				originalIds,
			);
		}

		body.input = filterInput(body.input, { preserveIds });

		// Debug: Verify all IDs were removed
		if (!preserveIds) {
			const remainingIds = (body.input || []).filter(item => item.id).map(item => item.id);
			if (remainingIds.length > 0) {
				logWarn(`WARNING: ${remainingIds.length} IDs still present after filtering:`, remainingIds);
			} else if (originalIds.length > 0) {
				logDebug(`Successfully removed all ${originalIds.length} message IDs`);
			}
		} else if (originalIds.length > 0) {
			logDebug(`Preserving ${originalIds.length} message IDs for prompt caching`);
		}

		if (codexMode) {
			// CODEX_MODE: Remove OpenCode system prompt, add bridge prompt only when real tools exist
			body.input = await filterOpenCodeSystemPrompts(body.input);
			body.input = addCodexBridgeMessage(body.input, hasNormalizedTools, sessionContext);
		} else {
			// DEFAULT MODE: Keep original behavior with tool remap message (only when tools truly exist)
			body.input = addToolRemapMessage(body.input, hasNormalizedTools);
		}
	}

	// Configure reasoning (use model-specific config)
	const reasoningConfig = getReasoningConfig(originalModel, modelConfig);
	body.reasoning = {
		...body.reasoning,
		...reasoningConfig,
	};

	// Configure text verbosity (support user config)
	// Default: "medium" (matches Codex CLI default for all GPT-5 models)
	body.text = {
		...body.text,
		verbosity: modelConfig.textVerbosity || "medium",
	};

	// Add include for encrypted reasoning content
	// Default: ["reasoning.encrypted_content"] (required for stateless operation with store=false)
	// This allows reasoning context to persist across turns without server-side storage
	body.include = modelConfig.include || ["reasoning.encrypted_content"];

	// Remove unsupported parameters
	body.max_output_tokens = undefined;
	body.max_completion_tokens = undefined;

	return { body, compactionDecision };
}
