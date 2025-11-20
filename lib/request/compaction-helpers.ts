/* eslint-disable no-param-reassign */
import {
	approximateTokenCount,
	buildCompactionPromptItems,
	collectSystemMessages,
	serializeConversation,
} from "../compaction/codex-compaction.js";
import type { CompactionDecision } from "../compaction/compaction-executor.js";
import { filterInput } from "./input-filters.js";
import type { InputItem, RequestBody } from "../types.js";
import { cloneInputItems } from "../utils/clone.js";
import { countConversationTurns } from "../utils/input-item-utils.js";

export interface CompactionSettings {
	enabled: boolean;
	autoLimitTokens?: number;
	autoMinMessages?: number;
}

export interface CompactionOptions {
	settings: CompactionSettings;
	commandText: string | null;
	originalInput: InputItem[];
	preserveIds?: boolean;
}

function removeLastUserMessage(items: InputItem[]): InputItem[] {
	const cloned = cloneInputItems(items);
	for (let index = cloned.length - 1; index >= 0; index -= 1) {
		if (cloned[index]?.role === "user") {
			cloned.splice(index, 1);
			break;
		}
	}
	return cloned;
}

function maybeBuildCompactionPrompt(
	originalInput: InputItem[],
	commandText: string | null,
	settings: CompactionSettings,
): { items: InputItem[]; decision: CompactionDecision } | null {
	if (!settings.enabled) {
		return null;
	}
	const conversationSource = commandText
		? removeLastUserMessage(originalInput)
		: cloneInputItems(originalInput);
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

export function applyCompactionIfNeeded(
	body: RequestBody,
	compactionOptions?: CompactionOptions,
): CompactionDecision | undefined {
	if (!compactionOptions?.settings.enabled) {
		return undefined;
	}

	const compactionBuild = maybeBuildCompactionPrompt(
		compactionOptions.originalInput,
		compactionOptions.commandText,
		compactionOptions.settings,
	);

	if (!compactionBuild) {
		return undefined;
	}

	const preserveIds = compactionOptions.preserveIds ?? false;
	body.input = filterInput(compactionBuild.items, { preserveIds });
	delete (body as any).tools;
	delete (body as any).tool_choice;
	delete (body as any).parallel_tool_calls;

	return compactionBuild.decision;
}
