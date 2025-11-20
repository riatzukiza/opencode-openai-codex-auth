import { CODEX_COMPACTION_PROMPT, CODEX_SUMMARY_PREFIX } from "../prompts/codex-compaction.js";
import type { InputItem } from "../types.js";
import { cloneInputItems, deepClone } from "../utils/clone.js";
import { extractTextFromItem } from "../utils/input-item-utils.js";

const DEFAULT_TRANSCRIPT_CHAR_LIMIT = 12_000;
const COMMAND_TRIGGERS = ["codex-compact", "compact", "codexcompact", "compactnow"];

export interface ConversationSerialization {
	transcript: string;
	totalTurns: number;
	droppedTurns: number;
}

export interface CompactionBuildResult {
	items: InputItem[];
	serialization: ConversationSerialization;
}

export interface CompactionConfig {
	enabled: boolean;
	autoLimitTokens?: number;
	autoMinMessages?: number;
}

export function approximateTokenCount(items: InputItem[] | undefined): number {
	if (!Array.isArray(items) || items.length === 0) {
		return 0;
	}
	let chars = 0;
	for (const item of items) {
		chars += extractTextFromItem(item).length;
	}
	return Math.max(0, Math.ceil(chars / 4));
}

export function detectCompactionCommand(input: InputItem[] | undefined): string | null {
	if (!Array.isArray(input) || input.length === 0) {
		return null;
	}
	for (let index = input.length - 1; index >= 0; index -= 1) {
		const item = input[index];
		if (!item || item.role !== "user") continue;
		const content = extractTextFromItem(item).trim();
		if (!content) continue;
		const normalized = normalizeCommandTrigger(content);
		if (COMMAND_TRIGGERS.some((trigger) => normalized === trigger || normalized.startsWith(`${trigger} `))) {
			return normalized;
		}
		break;
	}
	return null;
}

export function serializeConversation(
	items: InputItem[] | undefined,
	limit = DEFAULT_TRANSCRIPT_CHAR_LIMIT,
): ConversationSerialization {
	if (!Array.isArray(items) || items.length === 0) {
		return { transcript: "", totalTurns: 0, droppedTurns: 0 };
	}
	const conversation: Array<{ role: string; text: string }> = [];
	for (const item of items) {
		const text = extractTextFromItem(item);
		if (!text) continue;
		const role = formatRole(item.role);
		if (!role) continue;
		conversation.push({ role, text });
	}
	let totalChars = 0;
	const selected: Array<{ role: string; text: string }> = [];
	for (let index = conversation.length - 1; index >= 0; index -= 1) {
		const entry = conversation[index];
		const chunk = formatEntry(entry.role, entry.text);
		selected.push(entry);
		totalChars += chunk.length;
		if (totalChars >= limit) {
			break;
		}
	}
	selected.reverse();
	const transcript = selected.map((entry) => formatEntry(entry.role, entry.text)).join("\n");
	const droppedTurns = Math.max(0, conversation.length - selected.length);
	return { transcript, totalTurns: conversation.length, droppedTurns };
}

export function buildCompactionPromptItems(transcript: string): InputItem[] {
	const compactionMetadata = { source: "opencode-compaction", opencodeCompaction: true };
	const developer: InputItem = {
		type: "message",
		role: "developer",
		content: CODEX_COMPACTION_PROMPT,
		metadata: compactionMetadata,
	};
	const user: InputItem = {
		type: "message",
		role: "user",
		content: transcript || "(conversation is empty)",
		metadata: compactionMetadata,
	};
	return [developer, user];
}

export function collectSystemMessages(items: InputItem[] | undefined): InputItem[] {
	if (!Array.isArray(items)) return [];
	return items
		.filter((item) => item && (item.role === "system" || item.role === "developer"))
		.map((item) => deepClone(item));
}

export function createSummaryMessage(summaryText: string): InputItem {
	const normalized = summaryText?.trim() ?? "(no summary available)";
	const withPrefix = normalized.startsWith(CODEX_SUMMARY_PREFIX)
		? normalized
		: `${CODEX_SUMMARY_PREFIX}\n\n${normalized}`;
	return {
		type: "message",
		role: "user",
		content: withPrefix,
	};
}

export function extractTailAfterSummary(items: InputItem[] | undefined): InputItem[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (!item || item.role !== "user") continue;
		const text = extractTextFromItem(item);
		if (!text) continue;
		return cloneInputItems(items.slice(index));
	}
	return [];
}

function normalizeCommandTrigger(value: string): string {
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return "";
	if (trimmed.startsWith("/") || trimmed.startsWith("?")) {
		return trimmed.slice(1).trimStart();
	}
	return trimmed;
}

function formatRole(role: string): string | null {
	if (!role) return null;
	const lower = role.toLowerCase();
	if (lower === "user" || lower === "assistant") {
		return lower === "user" ? "User" : "Assistant";
	}
	return null;
}

function formatEntry(role: string, text: string): string {
	return `## ${role}\n${text.trim()}\n`;
}
