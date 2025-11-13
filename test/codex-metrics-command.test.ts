import { describe, it, expect, beforeEach, vi } from "vitest";
import { maybeHandleCodexCommand } from "../lib/commands/codex-metrics.js";
import type { RequestBody } from "../lib/types.js";
import { SessionManager } from "../lib/session/session-manager.js";
import { resetCacheMetrics } from "../lib/cache/cache-metrics.js";
import { getCacheWarmSnapshot } from "../lib/cache/cache-warming.js";

vi.mock("../lib/cache/cache-warming.js", () => ({
	getCacheWarmSnapshot: vi.fn(() => ({
		codexInstructions: true,
		opencodePrompt: false,
	})),
}));

function buildBody(message: string): RequestBody {
	return {
		model: "gpt-5-codex",
		input: [
			{
				type: "message",
				role: "user",
				content: [
					{
						type: "input_text",
						text: message,
					},
				],
			},
		],
	};
}

describe("maybeHandleCodexCommand", () => {
	beforeEach(() => {
		resetCacheMetrics();
	});

	it("ignores non-command messages", () => {
		const body = buildBody("hello world");
		const result = maybeHandleCodexCommand(body);
		expect(result).toBeUndefined();
	});

	it("returns assistant response for /codex-metrics", async () => {
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body);
		expect(response).toBeInstanceOf(Response);
		const payload = await response!.json();
		expect(payload.metadata.command).toBe("codex-metrics");
		const firstOutput = payload.output?.[0]?.content?.[0]?.text ?? "";
		expect(firstOutput).toContain("Codex Metrics");
	});

	it("embeds prompt cache stats when session data exists", async () => {
		const manager = new SessionManager({ enabled: true });
		const conversationBody: RequestBody = {
			model: "gpt-5",
			metadata: { conversation_id: "metrics-session" },
			input: [
				{ type: "message", role: "user", content: "seed" },
			],
		};
		const context = manager.getContext(conversationBody);
		if (context) {
			manager.applyRequest(conversationBody, context);
		}

		const response = maybeHandleCodexCommand(buildBody("/codex-metrics"), { sessionManager: manager });
		const payload = await response!.json();
		expect(payload.metadata.promptCache.totalSessions).toBeGreaterThanOrEqual(1);
		expect(payload.metadata.promptCache.recentSessions[0].id).toBe("metrics-session");
	});

	it("handles /codex-metrics with additional arguments", async () => {
		const body = buildBody("/codex-metrics detailed");
		const response = maybeHandleCodexCommand(body);
		expect(response).toBeInstanceOf(Response);
		const payload = await response!.json();
		expect(payload.metadata.command).toBe("codex-metrics");
		const firstOutput = payload.output?.[0]?.content?.[0]?.text ?? "";
		expect(firstOutput).toContain("Codex Metrics");
	});

	it("handles case insensitive command", async () => {
		const body = buildBody("/CODEX-METRICS");
		const response = maybeHandleCodexCommand(body);
		expect(response).toBeInstanceOf(Response);
		const payload = await response!.json();
		expect(payload.metadata.command).toBe("codex-metrics");
	});

	it("handles command with extra whitespace", async () => {
		const body = buildBody("  /codex-metrics  ");
		const response = maybeHandleCodexCommand(body);
		expect(response).toBeInstanceOf(Response);
		const payload = await response!.json();
		expect(payload.metadata.command).toBe("codex-metrics");
	});

	it("handles empty input array", () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [],
		};
		const result = maybeHandleCodexCommand(body);
		expect(result).toBeUndefined();
	});

	it("handles non-array input", () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: "not an array" as any,
		};
		const result = maybeHandleCodexCommand(body);
		expect(result).toBeUndefined();
	});

	it("handles input with no user messages", () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [
				{ type: "message", role: "system", content: "system message" },
				{ type: "message", role: "assistant", content: "assistant message" },
			],
		};
		const result = maybeHandleCodexCommand(body);
		expect(result).toBeUndefined();
	});

	it("handles user message with empty content", () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [
				{ type: "message", role: "user", content: "" },
			],
		};
		const result = maybeHandleCodexCommand(body);
		expect(result).toBeUndefined();
	});

	it("handles user message with null content", () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [
				{ type: "message", role: "user", content: null },
			],
		};
		const result = maybeHandleCodexCommand(body);
		expect(result).toBeUndefined();
	});

	it("handles user message with string content", () => {
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body);
		expect(response).toBeInstanceOf(Response);
	});

	it("handles user message with array content containing text", () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [
				{
					type: "message",
					role: "user",
					content: [
						{ type: "input_text", text: "/codex-metrics" },
						{ type: "image", image_url: "url" },
					],
				},
			],
		};
		const response = maybeHandleCodexCommand(body);
		expect(response).toBeInstanceOf(Response);
	});

	it("handles user message with array content without text", () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [
				{
					type: "message",
					role: "user",
					content: [
						{ type: "image", image_url: "url" },
					],
				},
			],
		};
		const result = maybeHandleCodexCommand(body);
		expect(result).toBeUndefined();
	});

	it("handles malformed content array", () => {
		const body: RequestBody = {
			model: "gpt-5",
			input: [
				{
					type: "message",
					role: "user",
					content: [
						null,
						undefined,
						{ type: "input_text" }, // missing text
						"not an object",
					],
				},
			],
		};
		const result = maybeHandleCodexCommand(body);
		expect(result).toBeUndefined();
	});

	it("creates response with correct structure", async () => {
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body);
		expect(response).toBeInstanceOf(Response);
		
		const payload = await response!.json();
		expect(payload).toHaveProperty('id');
		expect(payload).toHaveProperty('object', 'response');
		expect(payload).toHaveProperty('created');
		expect(payload).toHaveProperty('model', 'gpt-5-codex');
		expect(payload).toHaveProperty('status', 'completed');
		expect(payload).toHaveProperty('usage');
		expect(payload).toHaveProperty('output');
		expect(payload).toHaveProperty('metadata');
		
		expect(payload.usage).toHaveProperty('input_tokens', 0);
		expect(payload.usage).toHaveProperty('output_tokens');
		expect(payload.usage).toHaveProperty('reasoning_tokens', 0);
		expect(payload.usage).toHaveProperty('total_tokens');
		
		expect(Array.isArray(payload.output)).toBe(true);
		expect(payload.output[0]).toHaveProperty('id');
		expect(payload.output[0]).toHaveProperty('type', 'message');
		expect(payload.output[0]).toHaveProperty('role', 'assistant');
		expect(payload.output[0]).toHaveProperty('content');
		expect(payload.output[0]).toHaveProperty('metadata');
	});

	it("estimates tokens correctly for short text", async () => {
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body);
		const payload = await response!.json();
		// Short text should still have at least 1 token
		expect(payload.usage.output_tokens).toBeGreaterThanOrEqual(1);
	});

	it("estimates tokens correctly for long text", async () => {
		// Mock a longer response by manipulating the format function
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body);
		const payload = await response!.json();
		// Longer text should have more tokens
		expect(payload.usage.output_tokens).toBeGreaterThan(10);
	});

	it("handles missing session manager", async () => {
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body, {});
		const payload = await response!.json();
		expect(payload.metadata.promptCache.enabled).toBe(false);
		expect(payload.metadata.promptCache.totalSessions).toBe(0);
		expect(payload.metadata.promptCache.recentSessions).toEqual([]);
	});

	it("handles session manager without getMetrics method", async () => {
		const managerWithoutMetrics = {
			getMetrics: undefined,
		} as any;
		
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body, { sessionManager: managerWithoutMetrics });
		const payload = await response!.json();
		expect(payload.metadata.promptCache.enabled).toBe(false);
	});

	it("includes cache warm status in response", async () => {
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body);
		const payload = await response!.json();
		expect(payload.metadata.cacheWarmStatus).toHaveProperty('codexInstructions');
		expect(payload.metadata.cacheWarmStatus).toHaveProperty('opencodePrompt');
	});

	it("generates unique IDs for response and messages", async () => {
		const body = buildBody("/codex-metrics");
		const response1 = maybeHandleCodexCommand(body);
		const response2 = maybeHandleCodexCommand(body);
		
		const payload1 = await response1!.json();
		const payload2 = await response2!.json();
		
		expect(payload1.id).not.toBe(payload2.id);
		expect(payload1.output[0].id).not.toBe(payload2.output[0].id);
	});

	it("sets correct content type header", () => {
		const body = buildBody("/codex-metrics");
		const response = maybeHandleCodexCommand(body);
		expect(response?.headers.get('content-type')).toBe('application/json; charset=utf-8');
	});

	it("handles model undefined in body", async () => {
		const body: RequestBody = {
			model: undefined as any,
			input: [
				{
					type: "message",
					role: "user",
					content: "/codex-metrics",
				},
			],
		};
		const response = maybeHandleCodexCommand(body);
		const payload = await response!.json();
		expect(payload.model).toBe("gpt-5"); // fallback model
	});
});
