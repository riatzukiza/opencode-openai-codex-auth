import { describe, expect, it } from "vitest";
import {
	approximateTokenCount,
	buildCompactionPromptItems,
	collectSystemMessages,
	createSummaryMessage,
	detectCompactionCommand,
	extractTailAfterSummary,
	serializeConversation,
} from "../lib/compaction/codex-compaction.js";
import type { InputItem } from "../lib/types.js";

describe("codex compaction helpers", () => {
	it("detects slash commands in latest user message", () => {
		const input: InputItem[] = [
			{ type: "message", role: "user", content: "hello" },
			{ type: "message", role: "assistant", content: "response" },
			{ type: "message", role: "user", content: "/codex-compact please" },
		];

		expect(detectCompactionCommand(input)).toBe("codex-compact please");
	});

	it("serializes conversation while truncating older turns", () => {
		const turns: InputItem[] = Array.from({ length: 5 }, (_, index) => ({
			type: "message",
			role: index % 2 === 0 ? "user" : "assistant",
			content: `message-${index + 1}`,
		}));

		const { transcript, totalTurns, droppedTurns } = serializeConversation(turns, 40);
		expect(totalTurns).toBe(5);
		expect(droppedTurns).toBeGreaterThan(0);
		expect(transcript).toContain("## User");
		expect(transcript).toMatch(/message-4/);
	});

	it("builds compaction prompt with developer + user messages", () => {
		const items = buildCompactionPromptItems("Example transcript");
		expect(items).toHaveLength(2);
		expect(items[0].role).toBe("developer");
		expect(items[1].role).toBe("user");
	});

	it("collects developer/system instructions for reuse", () => {
		const items: InputItem[] = [
			{ type: "message", role: "system", content: "sys" },
			{ type: "message", role: "developer", content: "dev" },
			{ type: "message", role: "user", content: "user" },
		];
		const collected = collectSystemMessages(items);
		expect(collected).toHaveLength(2);
		expect(collected[0].content).toBe("sys");
	});

	it("wraps summary with prefix when needed", () => {
		const summary = createSummaryMessage("Short summary");
		expect(typeof summary.content).toBe("string");
		expect(summary.content as string).toContain("Another language model");
	});

	it("estimates token count via text length heuristic", () => {
		const items: InputItem[] = [{ type: "message", role: "user", content: "a".repeat(200) }];
		expect(approximateTokenCount(items)).toBeGreaterThan(40);
	});

	it("returns zero tokens when there is no content", () => {
		expect(approximateTokenCount(undefined)).toBe(0);
		expect(approximateTokenCount([])).toBe(0);
	});

	it("ignores user messages without compaction commands", () => {
		const input: InputItem[] = [
			{ type: "message", role: "user", content: "just chatting" },
			{ type: "message", role: "assistant", content: "reply" },
		];
		expect(detectCompactionCommand(input)).toBeNull();
	});

	it("extracts tail after the latest user summary message", () => {
		const items: InputItem[] = [
			{ type: "message", role: "user", content: "review summary" },
			{ type: "message", role: "assistant", content: "analysis" },
			{ type: "message", role: "user", content: "follow-up" },
		];
		const tail = extractTailAfterSummary(items);
		expect(tail).toHaveLength(1);
		expect(tail[0].role).toBe("user");
	});

	it("returns empty tail when no user summary exists", () => {
		const input: InputItem[] = [{ type: "message", role: "assistant", content: "analysis" }];
		expect(extractTailAfterSummary(input)).toEqual([]);
	});
});
