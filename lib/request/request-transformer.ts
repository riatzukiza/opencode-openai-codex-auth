/* eslint-disable no-param-reassign */
import { logDebug, logWarn } from "../logger.js";
import type { RequestBody, SessionContext, UserConfig } from "../types.js";
import {
	addCodexBridgeMessage,
	addToolRemapMessage,
	filterInput,
	filterOpenCodeSystemPrompts,
	filterOpenCodeSystemPromptsWithEnv,
} from "./input-filters.js";

import { getModelConfig, getReasoningConfig, normalizeModel } from "./model-config.js";
import { ensurePromptCacheKey, logCacheKeyDecision } from "./prompt-cache.js";
import { normalizeToolsForCodexBody } from "./tooling.js";

export {
	addCodexBridgeMessage,
	addToolRemapMessage,
	filterInput,
	filterOpenCodeSystemPrompts,
	isOpenCodeSystemPrompt,
} from "./input-filters.js";
export { getModelConfig, getReasoningConfig, normalizeModel } from "./model-config.js";

export interface TransformRequestOptions {
	/** Preserve IDs when prompt caching requires it. */
	preserveIds?: boolean;
}

export interface TransformResult {
	/** Mutated request body (same instance passed into transformRequestBody). */
	body: RequestBody;
}

async function transformInputForCodex(
	body: RequestBody,
	codexMode: boolean,
	preserveIds: boolean,
	hasNormalizedTools: boolean,
	sessionContext?: SessionContext,
): Promise<void> {
	if (!body.input || !Array.isArray(body.input)) {
		return;
	}

	const originalIds = body.input.filter((item) => item.id).map((item) => item.id);
	if (originalIds.length > 0) {
		logDebug(`Filtering ${originalIds.length} message IDs from input:`, originalIds);
	}

	let workingInput = filterInput(body.input, { preserveIds, preserveMetadata: true });

	if (!preserveIds) {
		const remainingIds = (workingInput || []).filter((item) => item.id).map((item) => item.id);
		if (remainingIds.length > 0) {
			logWarn(`WARNING: ${remainingIds.length} IDs still present after filtering:`, remainingIds);
		} else if (originalIds.length > 0) {
			logDebug(`Successfully removed all ${originalIds.length} message IDs`);
		}
	} else if (originalIds.length > 0) {
		logDebug(`Preserving ${originalIds.length} message IDs for prompt caching`);
	}

	if (codexMode) {
		const appendEnvTail = process.env.CODEX_APPEND_ENV_CONTEXT === "1";
		if (appendEnvTail) {
			const result = await filterOpenCodeSystemPromptsWithEnv(workingInput);
			workingInput = result?.input;
			if (result?.envSegments?.length) {
				workingInput = workingInput || [];
				workingInput = [
					...(workingInput || []),
					{
						type: "message",
						role: "developer",
						content: result.envSegments.join("\n"),
					},
				];
			}
		} else {
			workingInput = await filterOpenCodeSystemPrompts(workingInput);
		}

		if (!preserveIds) {
			workingInput = filterInput(workingInput, { preserveIds });
		}
		workingInput = addCodexBridgeMessage(workingInput, hasNormalizedTools, sessionContext);
		body.input = workingInput;
		return;
	}

	if (!preserveIds) {
		workingInput = filterInput(workingInput, { preserveIds });
	}

	body.input = addToolRemapMessage(workingInput, hasNormalizedTools);
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

	const lookupModel = originalModel || normalizedModel;
	const modelConfig = getModelConfig(lookupModel, userConfig);

	logDebug(`Model config lookup: "${lookupModel}" → normalized to "${normalizedModel}" for API`, {
		hasModelSpecificConfig: !!userConfig.models?.[lookupModel],
		resolvedConfig: modelConfig,
	});

	body.model = normalizedModel;
	body.store = false;
	body.stream = true;
	body.instructions = codexInstructions;

	const cacheKeyResult = ensurePromptCacheKey(body);
	const isNewSession = sessionContext?.isNew ?? true;
	logCacheKeyDecision(cacheKeyResult, isNewSession);

	const hasNormalizedTools = normalizeToolsForCodexBody(body, false);

	await transformInputForCodex(body, codexMode, preserveIds, hasNormalizedTools, sessionContext);

	const reasoningConfig = getReasoningConfig(originalModel, modelConfig);
	body.reasoning = {
		...body.reasoning,
		...reasoningConfig,
	};

	body.text = {
		...body.text,
		verbosity: modelConfig.textVerbosity || "medium",
	};

	body.include = modelConfig.include || ["reasoning.encrypted_content"];

	body.max_output_tokens = undefined;
	body.max_completion_tokens = undefined;

	return { body };
}
