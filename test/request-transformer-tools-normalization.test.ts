import { describe, expect, it } from "vitest";
import { transformRequestBody } from "../lib/request/request-transformer.js";
import type { TransformRequestOptions } from "../lib/request/request-transformer.js";
import type { RequestBody, UserConfig } from "../lib/types.js";

async function runTransform(
	body: RequestBody,
	instructions: string,
	userConfig?: UserConfig,
	codexMode = true,
	options: TransformRequestOptions = {},
) {
	const result = await transformRequestBody(body, instructions, userConfig, codexMode, options);
	return result.body;
}

const codexInstructions = "Test Codex Instructions";

describe("transformRequestBody - tools normalization", () => {
	it("normalizes string tools and native Codex tools", async () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [{ type: "message", role: "user", content: "hello" }],
			tools: ["shell", "apply_patch", "my_tool"],
		} as any;

		const result: any = await runTransform(body, codexInstructions);

		const tools = result.tools as any[];
		expect(Array.isArray(tools)).toBe(true);
		expect(tools).toHaveLength(3);

		// Native Codex tools are passed through as type-only entries
		expect(tools[0]).toEqual({ type: "shell" });
		expect(tools[1]).toEqual({ type: "apply_patch" });

		// String tools become function tools with default schema
		expect(tools[2].type).toBe("function");
		expect(tools[2].name).toBe("my_tool");
		expect(tools[2].strict).toBe(false);
		expect(tools[2].parameters).toEqual({
			type: "object",
			properties: {},
			additionalProperties: true,
		});

		// Non-codex models allow parallel tool calls
		expect(result.tool_choice).toBe("auto");
		expect(result.parallel_tool_calls).toBe(true);
	});

	it("normalizes function-style tool objects and disables parallel calls for codex models", async () => {
		const body: RequestBody = {
			model: "gpt-5-codex",
			input: [{ type: "message", role: "user", content: "hello" }],
			tools: [
				{
					type: "function",
					name: "toolA",
					description: "A function tool",
					parameters: {
						type: "object",
						properties: { foo: { type: "string" } },
					},
					strict: true,
				},
				{
					type: "function",
					function: {
						name: "toolB",
						description: "Nested function",
						parameters: { type: "object", properties: {} },
						strict: false,
					},
				} as any,
				{ type: "local_shell" },
				{ type: "web_search" },
			],
		} as any;

		const result: any = await runTransform(body, codexInstructions);
		const tools = result.tools as any[];

		expect(tools.map((t) => t.type)).toEqual(["function", "function", "local_shell", "web_search"]);

		// Direct function object uses its own fields
		expect(tools[0].name).toBe("toolA");
		expect(tools[0].description).toBe("A function tool");
		expect(tools[0].parameters).toEqual({
			type: "object",
			properties: { foo: { type: "string" } },
		});
		expect(tools[0].strict).toBe(true);

		// Nested function object prefers nested fields
		expect(tools[1].name).toBe("toolB");
		expect(tools[1].description).toBe("Nested function");
		expect(tools[1].strict).toBe(false);

		// Codex models disable parallel tool calls
		expect(result.tool_choice).toBe("auto");
		expect(result.parallel_tool_calls).toBe(false);
	});

	it("supports tools as boolean or object map and respects enabled flag", async () => {
		const userConfig: UserConfig = {
			global: {},
			models: {},
		};

		const body: RequestBody = {
			model: "gpt-5",
			input: [{ type: "message", role: "user", content: "test" }],
			tools: {
				activeFn: {
					description: "Active function",
					parameters: { type: "object", properties: { a: { type: "number" } } },
					strict: true,
				},
				freeform: {
					type: "custom",
					description: "Freeform output",
					format: {
						type: "json_schema/v1",
						syntax: "json",
						definition: '{"x":1}',
					},
				},
				disabled: {
					enabled: false,
					description: "Should be skipped",
				},
				boolFn: true,
				boolDisabled: false,
			} as any,
		} as any;

		const result: any = await runTransform(body, codexInstructions, userConfig, true, {
			preserveIds: false,
		});

		const tools = result.tools as any[];
		const names = tools.map((t) => t.name ?? t.type);

		// Map should produce entries for activeFn, freeform, and boolFn
		expect(names).toContain("activeFn");
		expect(names).toContain("freeform");
		expect(names).toContain("boolFn");

		// Disabled entries (explicit or boolean false) must be skipped
		expect(names).not.toContain("disabled");
		expect(names).not.toContain("boolDisabled");

		const freeformTool = tools.find((t) => t.name === "freeform");
		expect(freeformTool.type).toBe("custom");
		expect(freeformTool.format).toEqual({
			type: "json_schema/v1",
			syntax: "json",
			definition: '{"x":1}',
		});
	});

	it("drops tools field when normalization yields no tools", async () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [{ type: "message", role: "user", content: "test" }],
			tools: {
				disabled: { enabled: false },
				boolDisabled: false,
			} as any,
		} as any;

		const result: any = await runTransform(body, codexInstructions);

		// All entries were disabled, so tools and related fields should be removed
		expect(result.tools).toBeUndefined();
		expect(result.tool_choice).toBeUndefined();
		expect(result.parallel_tool_calls).toBeUndefined();
	});
});
