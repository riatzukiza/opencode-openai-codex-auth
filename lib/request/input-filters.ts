/* eslint-disable no-param-reassign */
import {
	cacheBridgeDecision,
	generateContentHash,
	generateInputHash,
	getCachedBridgeDecision,
	hasBridgePromptInConversation,
} from "../cache/prompt-fingerprinting.js";
import { CODEX_OPENCODE_BRIDGE } from "../prompts/codex-opencode-bridge.js";
import { TOOL_REMAP_MESSAGE } from "../prompts/codex.js";
import { getOpenCodeCodexPrompt } from "../prompts/opencode-codex.js";
import type { InputItem, SessionContext } from "../types.js";
import { extractTextFromItem } from "../utils/input-item-utils.js";
import { logDebug } from "../logger.js";

const TOOL_REMAP_MESSAGE_HASH = generateContentHash(TOOL_REMAP_MESSAGE);

export function filterInput(
	input: InputItem[] | undefined,
	options: { preserveIds?: boolean; preserveMetadata?: boolean } = {},
): InputItem[] | undefined {
	if (!Array.isArray(input)) return input;

	const { preserveIds = false, preserveMetadata = false } = options;

	return input
		.filter((item) => {
			if (item.type === "item_reference") {
				return false;
			}
			return true;
		})
		.map((item) => {
			let sanitized = item as InputItem;

			if (item.id && !preserveIds) {
				const { id: _id, ...itemWithoutId } = item as Record<string, unknown> & InputItem;
				sanitized = itemWithoutId as InputItem;
			}

			if (!preserveIds && !preserveMetadata && "metadata" in (sanitized as Record<string, unknown>)) {
				const { metadata: _metadata, ...rest } = sanitized as Record<string, unknown>;
				sanitized = rest as InputItem;
			}

			return sanitized;
		});
}

export function isOpenCodeSystemPrompt(item: InputItem, cachedPrompt: string | null): boolean {
	const isSystemRole = item.role === "developer" || item.role === "system";
	if (!isSystemRole) return false;

	const contentText = extractTextFromItem(item);
	if (!contentText) return false;

	if (cachedPrompt) {
		if (contentText.trim() === cachedPrompt.trim()) {
			return true;
		}

		const contentPrefix = contentText.trim().substring(0, 200);
		const cachedPrefix = cachedPrompt.trim().substring(0, 200);
		if (contentPrefix === cachedPrefix) {
			return true;
		}
	}

	return contentText.startsWith("You are a coding agent running in");
}

export async function filterOpenCodeSystemPrompts(
	input: InputItem[] | undefined,
): Promise<InputItem[] | undefined> {
	if (!Array.isArray(input)) return input;

	let cachedPrompt: string | null = null;
	try {
		cachedPrompt = await getOpenCodeCodexPrompt();
	} catch {
		// Fallback to text-based detection only
	}

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

	const hasCompactionMetadataFlag = (item: InputItem): boolean => {
		const rawMeta = (item as Record<string, unknown>)?.metadata ?? (item as Record<string, unknown>)?.meta;
		if (!rawMeta || typeof rawMeta !== "object") return false;
		const meta = rawMeta as Record<string, unknown>;
		const metaAny = meta as Record<string, any>;
		const source = metaAny.source as unknown;
		if (typeof source === "string" && source.toLowerCase() === "opencode-compaction") {
			return true;
		}
		if (metaAny.opencodeCompaction === true || metaAny.opencode_compaction === true) {
			return true;
		}
		return false;
	};

	const matchesCompactionInstruction = (value: string): boolean =>
		compactionInstructionPatterns.some((pattern) => pattern.test(value));

	const sanitizeOpenCodeCompactionPrompt = (item: InputItem): InputItem | null => {
		const text = extractTextFromItem(item);
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
		const text = extractTextFromItem(item);
		if (!text) return false;
		const hasCompaction = /\b(auto[-\s]?compaction|compaction|compact)\b/i.test(text);
		const hasSummary = /\b(summary|summarize|summarise)\b/i.test(text);
		return hasCompaction && hasSummary && matchesCompactionInstruction(text);
	};

	const filteredInput: InputItem[] = [];
	for (const item of input) {
		if (item.role === "user") {
			filteredInput.push(item);
			continue;
		}

		if (isOpenCodeSystemPrompt(item, cachedPrompt)) {
			continue;
		}

		const compactionMetadataFlagged = hasCompactionMetadataFlag(item);
		if (compactionMetadataFlagged || isOpenCodeCompactionPrompt(item)) {
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

function analyzeBridgeRequirement(
	input: InputItem[] | undefined,
	hasTools: boolean,
): { needsBridge: boolean; reason: string; toolCount: number } {
	if (!hasTools || !Array.isArray(input)) {
		return { needsBridge: false, reason: "no_tools_or_input", toolCount: 0 };
	}

	const toolCount = 1;

	return {
		needsBridge: true,
		reason: "tools_present",
		toolCount,
	};
}

function buildBridgeMessage(): InputItem {
	return {
		type: "message",
		role: "developer",
		content: [{ type: "input_text", text: CODEX_OPENCODE_BRIDGE }],
	};
}

export function addCodexBridgeMessage(
	input: InputItem[] | undefined,
	hasTools: boolean,
	sessionContext?: SessionContext,
): InputItem[] | undefined {
	if (!Array.isArray(input)) return input;

	const bridgeMessage = buildBridgeMessage();
	const sessionBridgeInjected = sessionContext?.state.bridgeInjected ?? false;
	const inputHash = generateInputHash(input);
	const analysis = analyzeBridgeRequirement(input, hasTools);

	if (sessionBridgeInjected) {
		const alreadyPresent = hasBridgePromptInConversation(input, CODEX_OPENCODE_BRIDGE);
		if (alreadyPresent) {
			logDebug("Bridge prompt already present; preserving session continuity");
			if (sessionContext) {
				sessionContext.state.bridgeInjected = true;
			}
			return input;
		}

		logDebug("Bridge prompt previously injected in session; reapplying for continuity");
		if (sessionContext) {
			sessionContext.state.bridgeInjected = true;
		}
		return [bridgeMessage, ...input];
	}

	if (hasBridgePromptInConversation(input, CODEX_OPENCODE_BRIDGE)) {
		logDebug("Bridge prompt already present in conversation, skipping injection");
		cacheBridgeDecision(inputHash, analysis.toolCount, false);
		return input;
	}

	const cachedDecision = getCachedBridgeDecision(inputHash, analysis.toolCount);
	if (cachedDecision) {
		const shouldAdd = cachedDecision.hash === generateContentHash("add");
		logDebug(`Using cached bridge decision: ${shouldAdd ? "add" : "skip"}`);
		if (shouldAdd) {
			if (sessionContext) {
				sessionContext.state.bridgeInjected = true;
			}

			return [bridgeMessage, ...input];
		}
		return input;
	}

	if (!analysis.needsBridge) {
		logDebug(`Skipping bridge prompt: ${analysis.reason} (tools: ${analysis.toolCount})`);
		cacheBridgeDecision(inputHash, analysis.toolCount, false);
		return input;
	}

	logDebug(`Adding bridge prompt: ${analysis.reason} (tools: ${analysis.toolCount})`);
	cacheBridgeDecision(inputHash, analysis.toolCount, true);

	if (sessionContext) {
		sessionContext.state.bridgeInjected = true;
	}

	return [bridgeMessage, ...input];
}

export function addToolRemapMessage(
	input: InputItem[] | undefined,
	hasTools: boolean,
): InputItem[] | undefined {
	if (!hasTools || !Array.isArray(input)) return input;

	const hasExistingToolRemap = input.some((item) => {
		if (item?.type !== "message" || item?.role !== "developer") return false;
		const contentText = extractTextFromItem(item);
		if (!contentText) return false;
		return generateContentHash(contentText) === TOOL_REMAP_MESSAGE_HASH;
	});

	if (hasExistingToolRemap) {
		return input;
	}

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
