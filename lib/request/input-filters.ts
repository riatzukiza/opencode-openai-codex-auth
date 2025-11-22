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

type FilterResult = { input?: InputItem[]; envSegments: string[] };

function stripOpenCodeEnvBlocks(contentText: string): {
	text: string;
	removed: boolean;
	removedBlocks: string[];
} {
	let removed = false;
	let sanitized = contentText;
	const removedBlocks: string[] = [];

	// Remove the standard environment header OpenCode prepends before <env>
	const envHeaderPattern = /Here is some useful information about the environment you are running in:\s*/i;
	const headerStripped = sanitized.replace(envHeaderPattern, "");
	if (headerStripped !== sanitized) {
		removed = true;
		sanitized = headerStripped;
	}

	const patterns = [/<env>[\s\S]*?<\/env>/g, /<files>[\s\S]*?<\/files>/g];

	for (const pattern of patterns) {
		const matches = sanitized.match(pattern);
		if (matches) {
			removedBlocks.push(...matches);
			removed = true;
			sanitized = sanitized.replace(pattern, "");
		}
	}

	return { text: sanitized.trim(), removed, removedBlocks };
}

async function filterOpenCodeSystemPromptsInternal(
	input: InputItem[] | undefined,
	options: { captureEnv?: boolean } = {},
): Promise<FilterResult | undefined> {
	if (!Array.isArray(input)) return input ? { input, envSegments: [] } : undefined;

	let cachedPrompt: string | null = null;
	try {
		cachedPrompt = await getOpenCodeCodexPrompt();
	} catch {
		// Fallback to text-based detection only
	}

	const filteredInput: InputItem[] = [];
	const envSegments: string[] = [];
	for (const item of input) {
		if (item.role === "user") {
			filteredInput.push(item);
			continue;
		}

		if (isOpenCodeSystemPrompt(item, cachedPrompt)) {
			continue;
		}

		const contentText = extractTextFromItem(item);
		if (typeof contentText === "string" && contentText.length > 0) {
			const { text, removed, removedBlocks } = stripOpenCodeEnvBlocks(contentText);
			if (options.captureEnv && removedBlocks.length > 0) {
				envSegments.push(...removedBlocks.map((block) => block.trim()).filter(Boolean));
			}
			if (removed && text.length === 0) {
				continue;
			}
			if (removed) {
				filteredInput.push({ ...item, content: text });
				continue;
			}
		}

		filteredInput.push(item);
	}

	return { input: filteredInput, envSegments };
}

export async function filterOpenCodeSystemPrompts(
	input: InputItem[] | undefined,
): Promise<InputItem[] | undefined> {
	const result = await filterOpenCodeSystemPromptsInternal(input);
	return result?.input;
}

export async function filterOpenCodeSystemPromptsWithEnv(
	input: InputItem[] | undefined,
): Promise<FilterResult | undefined> {
	return filterOpenCodeSystemPromptsInternal(input, { captureEnv: true });
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
