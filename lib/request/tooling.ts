/* eslint-disable no-param-reassign */
import type { RequestBody } from "../types.js";
import { normalizeToolsForResponses } from "./tool-normalizer.js";

export function normalizeToolsForCodexBody(body: RequestBody, skipConversationTransforms: boolean): boolean {
	if (skipConversationTransforms) {
		delete (body as any).tools;
		delete (body as any).tool_choice;
		delete (body as any).parallel_tool_calls;
		return false;
	}

	if (!body.tools) {
		return false;
	}

	const normalizedTools = normalizeToolsForResponses(body.tools);
	if (normalizedTools && normalizedTools.length > 0) {
		(body as any).tools = normalizedTools;
		(body as any).tool_choice = "auto";
		const modelName = (body.model || "").toLowerCase();
		const codexParallelDisabled = modelName.includes("gpt-5-codex") || modelName.includes("gpt-5.1-codex");
		(body as any).parallel_tool_calls = !codexParallelDisabled;
		return true;
	}

	delete (body as any).tools;
	delete (body as any).tool_choice;
	delete (body as any).parallel_tool_calls;
	return false;
}
