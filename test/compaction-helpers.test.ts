import { applyCompactionIfNeeded } from "../lib/request/compaction-helpers.js";
import type { InputItem, RequestBody } from "../lib/types.js";

describe("compaction helpers", () => {
	it("drops only the last user command and keeps trailing items", () => {
		const originalInput: InputItem[] = [
			{ type: "message", role: "assistant", content: "previous response" },
			{ type: "message", role: "user", content: "/codex-compact please" },
			{ type: "message", role: "assistant", content: "trailing assistant" },
		];
		const body: RequestBody = { model: "gpt-5", input: [...originalInput] };

		const decision = applyCompactionIfNeeded(body, {
			settings: { enabled: true },
			commandText: "codex-compact please",
			originalInput,
		});

		expect(decision?.mode).toBe("command");
		expect(decision?.serialization.transcript).toContain("previous response");
		expect(decision?.serialization.transcript).toContain("trailing assistant");
		expect(decision?.serialization.transcript).not.toContain("codex-compact please");

		// Verify RequestBody mutations
		expect(body.input).not.toEqual(originalInput);
		expect(body.input?.some((item) => item.content === "/codex-compact please")).toBe(false);
		expect((body as any).tools).toBeUndefined();
		expect((body as any).tool_choice).toBeUndefined();
		expect((body as any).parallel_tool_calls).toBeUndefined();
	});

	it("returns original items when no user message exists", () => {
		const originalInput: InputItem[] = [
			{
				type: "message",
				role: "assistant",
				content: "system-only follow-up",
			},
		];
		const body: RequestBody = { model: "gpt-5", input: [...originalInput] };

		const decision = applyCompactionIfNeeded(body, {
			settings: { enabled: true },
			commandText: "codex-compact",
			originalInput,
		});

		expect(decision?.serialization.totalTurns).toBe(1);
		expect(decision?.serialization.transcript).toContain("system-only follow-up");

		// Verify RequestBody mutations
		expect(body.input).toBeDefined();
		expect(body.input?.length).toBeGreaterThan(0);
		expect(body.input).not.toEqual(originalInput);
		expect((body as any).tools).toBeUndefined();
		expect((body as any).tool_choice).toBeUndefined();
	});
});
