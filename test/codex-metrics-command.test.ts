import { describe, it, expect, beforeEach } from "vitest";
import { maybeHandleCodexCommand } from "../lib/commands/codex-metrics.js";
import type { RequestBody } from "../lib/types.js";
import { SessionManager } from "../lib/session/session-manager.js";
import { resetCacheMetrics } from "../lib/cache/cache-metrics.js";

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
});
