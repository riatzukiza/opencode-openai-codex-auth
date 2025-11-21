import type { InputItem } from "../types.js";

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

function isNativeCodexTool(value: unknown): value is "shell" | "apply_patch" {
	return typeof value === "string" && (value === "shell" || value === "apply_patch");
}

function makeFunctionTool(
	name: unknown,
	description?: unknown,
	parameters?: unknown,
	strict?: unknown,
): Record<string, unknown> | undefined {
	if (typeof name !== "string" || !name.trim()) return undefined;
	const tool: Record<string, unknown> = {
		type: "function",
		name,
		strict: typeof strict === "boolean" ? strict : false,
		parameters: parameters && typeof parameters === "object" ? parameters : defaultFunctionParameters,
	};
	if (typeof description === "string" && description.trim()) {
		tool.description = description;
	}
	return tool;
}

function makeFreeformTool(
	name: unknown,
	description?: unknown,
	format?: unknown,
): Record<string, unknown> | undefined {
	if (typeof name !== "string" || !name.trim()) return undefined;
	const tool: Record<string, unknown> = {
		type: "custom",
		name,
		format: format && typeof format === "object" ? format : defaultFreeformFormat,
	};
	if (typeof description === "string" && description.trim()) {
		tool.description = description;
	}
	return tool;
}

function convertStringTool(value: string): any | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (isNativeCodexTool(trimmed)) return { type: trimmed };
	return makeFunctionTool(trimmed);
}

function getNestedFunction(obj: Record<string, unknown>): Record<string, unknown> | undefined {
	const fn = obj.function;
	return fn && typeof fn === "object" ? (fn as Record<string, unknown>) : undefined;
}

function convertTypedTool(
	type: string,
	obj: Record<string, unknown>,
	nestedFn: Record<string, unknown> | undefined,
): any | undefined {
	if (isNativeCodexTool(type)) return { type };
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
		return { type };
	}
	return undefined;
}

function convertNamedTool(name: string, obj: Record<string, unknown>): any | undefined {
	if (isNativeCodexTool(name)) return { type: name };
	return makeFunctionTool(name, obj.description, obj.parameters, obj.strict);
}

function convertObjectTool(obj: Record<string, unknown>): any | undefined {
	const nestedFn = getNestedFunction(obj);
	const type = typeof obj.type === "string" ? obj.type : undefined;

	if (type) {
		const typed = convertTypedTool(type, obj, nestedFn);
		if (typed) return typed;
	}

	if (typeof obj.name === "string") {
		return convertNamedTool(obj.name, obj);
	}

	if (nestedFn?.name) {
		return makeFunctionTool(nestedFn.name, nestedFn.description, nestedFn.parameters, nestedFn.strict);
	}

	return undefined;
}

function normalizeToolMap(map: Record<string, unknown>): any[] | undefined {
	return Object.entries(map)
		.map(([name, value]) => {
			if (value && typeof value === "object") {
				const record = value as Record<string, unknown>;
				const enabled = record.enabled ?? record.use ?? record.allow ?? true;
				if (!enabled) return undefined;
				if (record.type === "custom") {
					return makeFreeformTool(name, record.description, record.format);
				}
				return makeFunctionTool(name, record.description, record.parameters, record.strict);
			}
			if (value === true) {
				return makeFunctionTool(name);
			}
			return undefined;
		})
		.filter(Boolean) as any[];
}

export function normalizeToolsForResponses(tools: unknown): any[] | undefined {
	if (!tools) return undefined;
	if (Array.isArray(tools)) {
		return tools.map(convertTool).filter(Boolean) as any[];
	}
	if (typeof tools === "object") {
		return normalizeToolMap(tools as Record<string, unknown>);
	}
	return undefined;
}

function convertTool(candidate: unknown): any | undefined {
	if (!candidate) return undefined;
	if (typeof candidate === "string") return convertStringTool(candidate);
	if (typeof candidate !== "object") return undefined;
	return convertObjectTool(candidate as Record<string, unknown>);
}

export type { InputItem };
