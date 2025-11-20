import type { ConfigOptions, ReasoningConfig, UserConfig } from "../types.js";

export function normalizeModel(model: string | undefined): string {
	const fallback = "gpt-5.1";
	if (!model) return fallback;

	const lowered = model.toLowerCase();
	const sanitized = lowered.replace(/\./g, "-").replace(/[\s_/]+/g, "-");

	const contains = (needle: string) => sanitized.includes(needle);
	const hasGpt51 = contains("gpt-5-1") || sanitized.includes("gpt51");
	const hasCodexMax = contains("codex-max") || contains("codexmax");

	if (contains("gpt-5-1-codex-mini") || (hasGpt51 && contains("codex-mini"))) {
		return "gpt-5.1-codex-mini";
	}
	if (contains("codex-mini")) {
		return "gpt-5.1-codex-mini";
	}
	if (hasCodexMax) {
		return "gpt-5.1-codex-max";
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

export function getModelConfig(
	modelName: string,
	userConfig: UserConfig = { global: {}, models: {} },
): ConfigOptions {
	const globalOptions = userConfig.global || {};
	const modelOptions = userConfig.models?.[modelName]?.options || {};

	return { ...globalOptions, ...modelOptions };
}

type ModelFlags = {
	normalized: string;
	normalizedOriginal: string;
	isGpt51: boolean;
	isCodexMini: boolean;
	isCodexMax: boolean;
	isCodexFamily: boolean;
	isLightweight: boolean;
};

function classifyModel(originalModel: string | undefined): ModelFlags {
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
	const isCodexMax = normalized === "gpt-5.1-codex-max";
	const isCodexFamily =
		normalized.startsWith("gpt-5-codex") ||
		normalized.startsWith("gpt-5.1-codex") ||
		(normalizedOriginal.includes("codex") && !isCodexMini);
	const isLightweight =
		!isCodexMini &&
		!isCodexFamily &&
		(normalizedOriginal.includes("nano") || normalizedOriginal.includes("mini"));

	return {
		normalized,
		normalizedOriginal,
		isGpt51,
		isCodexMini,
		isCodexMax,
		isCodexFamily,
		isLightweight,
	};
}

function defaultEffortFor(flags: ModelFlags): ReasoningConfig["effort"] {
	if (flags.isGpt51 && !flags.isCodexFamily && !flags.isCodexMini) {
		return "none";
	}
	if (flags.isCodexMini) {
		return "medium";
	}
	if (flags.isLightweight) {
		return "minimal";
	}
	return "medium";
}

function applyRequestedEffort(
	requested: ReasoningConfig["effort"],
	flags: ModelFlags,
): ReasoningConfig["effort"] {
	if (requested === "xhigh" && !flags.isCodexMax) {
		return "high";
	}
	return requested;
}

function normalizeEffortForModel(
	effort: ReasoningConfig["effort"],
	flags: ModelFlags,
): ReasoningConfig["effort"] {
	if (flags.isCodexMini) {
		if (effort === "minimal" || effort === "low" || effort === "none") {
			return "medium";
		}
		return effort === "high" ? effort : "medium";
	}

	if (flags.isCodexMax) {
		if (effort === "minimal" || effort === "none") {
			return "low";
		}
		return effort;
	}

	if (flags.isCodexFamily) {
		if (effort === "minimal" || effort === "none") {
			return "low";
		}
		return effort;
	}

	if (flags.isGpt51 && effort === "minimal") {
		return "none";
	}

	if (!flags.isGpt51 && effort === "none") {
		return "minimal";
	}

	return effort;
}

export function getReasoningConfig(
	originalModel: string | undefined,
	userConfig: ConfigOptions = {},
): ReasoningConfig {
	const flags = classifyModel(originalModel);
	const requestedEffort = userConfig.reasoningEffort ?? defaultEffortFor(flags);
	const effortAfterRequest = applyRequestedEffort(requestedEffort, flags);
	const effort = normalizeEffortForModel(effortAfterRequest, flags);

	return {
		effort,
		summary: userConfig.reasoningSummary || "auto",
	};
}
