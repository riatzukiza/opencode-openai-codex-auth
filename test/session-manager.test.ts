import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { SESSION_CONFIG } from "../lib/constants.js";
import { SessionManager } from "../lib/session/session-manager.js";
import * as logger from "../lib/logger.js";
import type { InputItem, RequestBody, SessionContext } from "../lib/types.js";

interface BodyOptions {
	forkId?: string;
	parentConversationId?: string;
	parent_conversation_id?: string;
}

function createBody(conversationId: string, inputCount = 1, options: BodyOptions = {}): RequestBody {
	const metadata: Record<string, unknown> = {
		conversation_id: conversationId,
	};
	if (options.forkId) {
		metadata.forkId = options.forkId;
	}
	if (options.parentConversationId) {
		metadata.parentConversationId = options.parentConversationId;
	}
	if (options.parent_conversation_id) {
		metadata.parent_conversation_id = options.parent_conversation_id;
	}

	return {
		model: "gpt-5",
		metadata,
		input: Array.from({ length: inputCount }, (_, index) => ({
			type: "message",
			role: "user",
			id: `msg_${index + 1}`,
			content: `message-${index + 1}`,
		})),
	};
}

function hashItems(items: InputItem[]): string {
	return createHash("sha1").update(JSON.stringify(items)).digest("hex");
}

describe("SessionManager", () => {
	it("returns undefined when disabled", () => {
		const manager = new SessionManager({ enabled: false });
		const body = createBody("conv-disabled");
		const context = manager.getContext(body);

		expect(context).toBeUndefined();
	});

	it("initializes session and preserves ids when enabled", () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody("conv-123");

		let context = manager.getContext(body) as SessionContext;
		expect(context.enabled).toBe(true);
		expect(context.isNew).toBe(true);
		expect(context.preserveIds).toBe(true);
		expect(context.state.promptCacheKey).toBe("conv-123");

		context = manager.applyRequest(body, context) as SessionContext;
		expect(body.prompt_cache_key).toBe("conv-123");
		expect(context.state.lastInput.length).toBe(1);
	});

	it("maintains prefix across turns and reuses context", () => {
		const manager = new SessionManager({ enabled: true });
		const firstBody = createBody("conv-456");

		let context = manager.getContext(firstBody) as SessionContext;
		context = manager.applyRequest(firstBody, context) as SessionContext;

		const secondBody = createBody("conv-456", 2);
		let nextContext = manager.getContext(secondBody) as SessionContext;
		expect(nextContext.isNew).toBe(false);
		nextContext = manager.applyRequest(secondBody, nextContext) as SessionContext;

		expect(secondBody.prompt_cache_key).toBe("conv-456");
		expect(nextContext.state.lastInput.length).toBe(2);
		expect(nextContext.state.promptCacheKey).toBe(context.state.promptCacheKey);
	});

	it("regenerates cache key when prefix differs", () => {
		const manager = new SessionManager({ enabled: true });
		const baseBody = createBody("conv-789", 2);

		let context = manager.getContext(baseBody) as SessionContext;
		context = manager.applyRequest(baseBody, context) as SessionContext;

		const branchBody: RequestBody = {
			model: "gpt-5",
			metadata: { conversation_id: "conv-789" },
			input: [
				{
					type: "message",
					role: "user",
					id: "new_msg",
					content: "fresh-start",
				},
			],
		};

		let branchContext = manager.getContext(branchBody) as SessionContext;
		branchContext = manager.applyRequest(branchBody, branchContext) as SessionContext;

		expect(branchBody.prompt_cache_key).toMatch(/^cache_/);
		expect(branchContext.isNew).toBe(true);
		expect(branchContext.state.promptCacheKey).not.toBe(context.state.promptCacheKey);
	});

	it("logs system prompt changes when regenerating cache key", () => {
		const warnSpy = vi.spyOn(logger, "logWarn").mockImplementation(() => {});
		const manager = new SessionManager({ enabled: true });
		const baseBody: RequestBody = {
			model: "gpt-5",
			metadata: { conversation_id: "conv-system-change" },
			input: [
				{ type: "message", role: "system", content: "initial system" },
				{ type: "message", role: "user", content: "hello" },
			],
		};

		let context = manager.getContext(baseBody) as SessionContext;
		context = manager.applyRequest(baseBody, context) as SessionContext;

		const changedBody: RequestBody = {
			...baseBody,
			input: [
				{ type: "message", role: "system", content: "updated system prompt" },
				{ type: "message", role: "user", content: "hello" },
			],
		};

		const nextContext = manager.getContext(changedBody) as SessionContext;
		manager.applyRequest(changedBody, nextContext);

		const warnCall = warnSpy.mock.calls.find(
			([message]) => typeof message === "string" && message.includes("prefix mismatch"),
		);

		expect(warnCall?.[1]).toMatchObject({
			prefixCause: "system_prompt_changed",
			previousRole: "system",
			incomingRole: "system",
		});

		warnSpy.mockRestore();
	});

	it("logs history pruning when earlier tool results are removed", () => {
		const warnSpy = vi.spyOn(logger, "logWarn").mockImplementation(() => {});
		const manager = new SessionManager({ enabled: true });
		const fullBody: RequestBody = {
			model: "gpt-5",
			metadata: { conversation_id: "conv-history-prune" },
			input: [
				{ type: "message", role: "system", content: "sys" },
				{ type: "message", role: "user", content: "step 1" },
				{
					type: "message",
					role: "assistant",
					content: "tool call",
					tool_calls: [{ id: "call-1" }],
				},
				{ type: "message", role: "tool", content: "tool output", tool_call_id: "call-1" },
				{ type: "message", role: "user", content: "follow up" },
			],
		};

		let context = manager.getContext(fullBody) as SessionContext;
		context = manager.applyRequest(fullBody, context) as SessionContext;

		const prunedBody: RequestBody = {
			...fullBody,
			input: fullBody.input ? fullBody.input.slice(4) : [],
		};

		const prunedContext = manager.getContext(prunedBody) as SessionContext;
		manager.applyRequest(prunedBody, prunedContext);

		const warnCall = warnSpy.mock.calls.find(
			([message]) => typeof message === "string" && message.includes("prefix mismatch"),
		);

		expect(warnCall?.[1]).toMatchObject({
			prefixCause: "history_pruned",
			removedCount: 4,
		});
		expect((warnCall?.[1] as Record<string, unknown>)?.removedRoles).toContain("tool");

		warnSpy.mockRestore();
	});

	it("forks session when prefix matches partially and reuses compaction state", () => {
		const manager = new SessionManager({ enabled: true });
		const baseBody = createBody("conv-prefix-fork", 3);

		let baseContext = manager.getContext(baseBody) as SessionContext;
		baseContext = manager.applyRequest(baseBody, baseContext) as SessionContext;

		const systemMessage: InputItem = { type: "message", role: "system", content: "env vars" };
		manager.applyCompactionSummary(baseContext, {
			baseSystem: [systemMessage],
			summary: "Base summary",
		});

		const branchBody = createBody("conv-prefix-fork", 3);
		branchBody.input = [
			{ type: "message", role: "user", id: "msg_1", content: "message-1" },
			{ type: "message", role: "user", id: "msg_2", content: "message-2" },
			{ type: "message", role: "assistant", id: "msg_3", content: "diverged" },
		];

		let branchContext = manager.getContext(branchBody) as SessionContext;
		branchContext = manager.applyRequest(branchBody, branchContext) as SessionContext;

		const sharedPrefix = branchBody.input.slice(0, 2) as InputItem[];
		const expectedSuffix = hashItems(sharedPrefix).slice(0, 8);
		expect(branchBody.prompt_cache_key).toBe(`conv-prefix-fork::prefix::${expectedSuffix}`);
		expect(branchContext.state.promptCacheKey).toBe(`conv-prefix-fork::prefix::${expectedSuffix}`);
		expect(branchContext.isNew).toBe(true);

		const followUp = createBody("conv-prefix-fork", 1);
		followUp.input = [{ type: "message", role: "user", content: "follow-up" }];
		manager.applyCompactedHistory(followUp, branchContext);

		expect(followUp.input).toHaveLength(3);
		expect(followUp.input?.[0].role).toBe("system");
		expect(followUp.input?.[1].content).toContain("Base summary");
		expect(followUp.input?.[2].content).toBe("follow-up");
	});

	it("records cached token usage from response payload", () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody("conv-usage");

		let context = manager.getContext(body) as SessionContext;
		context = manager.applyRequest(body, context) as SessionContext;

		manager.recordResponse(context, { usage: { cached_tokens: 42 } });

		expect(context.state.lastCachedTokens).toBe(42);
	});

	it("reports metrics snapshot with recent sessions", () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody("conv-metrics");
		let context = manager.getContext(body) as SessionContext;
		context = manager.applyRequest(body, context) as SessionContext;

		const metrics = manager.getMetrics();
		expect(metrics.enabled).toBe(true);
		expect(metrics.totalSessions).toBe(1);
		expect(metrics.recentSessions[0].id).toBe("conv-metrics");
	});

	it("falls back to prompt_cache_key when metadata missing", () => {
		const manager = new SessionManager({ enabled: true });
		const body: RequestBody = {
			model: "gpt-5",
			input: [],
			prompt_cache_key: "fallback_cache_key",
		};

		const context = manager.getContext(body) as SessionContext;
		expect(context.enabled).toBe(true);
		expect(context.isNew).toBe(true);
		expect(context.state.promptCacheKey).toBe("fallback_cache_key");
	});

	it("reuses session when prompt_cache_key matches existing", () => {
		const manager = new SessionManager({ enabled: true });
		const cacheKey = "persistent_key_789";

		// First request creates session
		const firstBody: RequestBody = {
			model: "gpt-5",
			input: [],
			prompt_cache_key: cacheKey,
		};
		const firstContext = manager.getContext(firstBody) as SessionContext;
		expect(firstContext.isNew).toBe(true);

		// Second request reuses session
		const secondBody: RequestBody = {
			model: "gpt-5",
			input: [{ type: "message", role: "user", content: "second" }],
			prompt_cache_key: cacheKey,
		};
		const secondContext = manager.getContext(secondBody) as SessionContext;
		expect(secondContext.isNew).toBe(false);
		expect(secondContext.state.promptCacheKey).toBe(firstContext.state.promptCacheKey);
	});

	it("creates fork-specific sessions with derived cache keys", () => {
		const manager = new SessionManager({ enabled: true });
		const firstAlpha = createBody("conv-fork", 1, { forkId: "alpha" });
		let alphaContext = manager.getContext(firstAlpha) as SessionContext;
		expect(alphaContext.isNew).toBe(true);
		alphaContext = manager.applyRequest(firstAlpha, alphaContext) as SessionContext;
		expect(alphaContext.state.promptCacheKey).toBe("conv-fork::fork::alpha");

		const repeatAlpha = createBody("conv-fork", 2, { forkId: "alpha" });
		let repeatedContext = manager.getContext(repeatAlpha) as SessionContext;
		expect(repeatedContext.isNew).toBe(false);
		repeatedContext = manager.applyRequest(repeatAlpha, repeatedContext) as SessionContext;
		expect(repeatAlpha.prompt_cache_key).toBe("conv-fork::fork::alpha");

		const betaBody = createBody("conv-fork", 1, { forkId: "beta" });
		const betaContext = manager.getContext(betaBody) as SessionContext;
		expect(betaContext.isNew).toBe(true);
		expect(betaContext.state.promptCacheKey).toBe("conv-fork::fork::beta");
	});

	it("derives fork ids from parent conversation hints", () => {
		const manager = new SessionManager({ enabled: true });
		const parentBody = createBody("conv-fork-parent", 1, { parentConversationId: "parent-conv" });
		let parentContext = manager.getContext(parentBody) as SessionContext;
		expect(parentContext.isNew).toBe(true);
		expect(parentContext.state.promptCacheKey).toBe("conv-fork-parent::fork::parent-conv");
		manager.applyRequest(parentBody, parentContext);
		expect(parentBody.prompt_cache_key).toBe("conv-fork-parent::fork::parent-conv");

		const snakeParentBody = createBody("conv-fork-parent", 1, {
			parent_conversation_id: "parent-snake",
		});
		const snakeParentContext = manager.getContext(snakeParentBody) as SessionContext;
		expect(snakeParentContext.isNew).toBe(true);
		expect(snakeParentContext.state.promptCacheKey).toBe("conv-fork-parent::fork::parent-snake");
	});

	it("scopes compaction summaries per fork session", () => {
		const manager = new SessionManager({ enabled: true });
		const alphaBody = createBody("conv-fork-summary", 1, { forkId: "alpha" });
		let alphaContext = manager.getContext(alphaBody) as SessionContext;
		alphaContext = manager.applyRequest(alphaBody, alphaContext) as SessionContext;

		const systemMessage: InputItem = { type: "message", role: "system", content: "env vars" };
		manager.applyCompactionSummary(alphaContext, {
			baseSystem: [systemMessage],
			summary: "Alpha summary",
		});

		const alphaNext = createBody("conv-fork-summary", 1, { forkId: "alpha" });
		alphaNext.input = [{ type: "message", role: "user", content: "alpha task" }];
		manager.applyCompactedHistory(alphaNext, alphaContext);
		expect(alphaNext.input).toHaveLength(3);
		expect(alphaNext.input?.[1].content).toContain("Alpha summary");

		const betaBody = createBody("conv-fork-summary", 1, { forkId: "beta" });
		let betaContext = manager.getContext(betaBody) as SessionContext;
		betaContext = manager.applyRequest(betaBody, betaContext) as SessionContext;

		const betaNext = createBody("conv-fork-summary", 1, { forkId: "beta" });
		betaNext.input = [{ type: "message", role: "user", content: "beta task" }];
		manager.applyCompactedHistory(betaNext, betaContext);
		expect(betaNext.input).toHaveLength(1);

		manager.applyCompactionSummary(betaContext, {
			baseSystem: [],
			summary: "Beta summary",
		});

		const betaFollowUp = createBody("conv-fork-summary", 1, { forkId: "beta" });
		betaFollowUp.input = [{ type: "message", role: "user", content: "beta follow-up" }];
		manager.applyCompactedHistory(betaFollowUp, betaContext);
		expect(betaFollowUp.input).toHaveLength(2);
		expect(betaFollowUp.input?.[0].content).toContain("Beta summary");
		expect(betaFollowUp.input?.[1].content).toBe("beta follow-up");
	});

	it("evicts sessions that exceed idle TTL", () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody("conv-expire");
		let context = manager.getContext(body) as SessionContext;
		context = manager.applyRequest(body, context) as SessionContext;

		context.state.lastUpdated = Date.now() - SESSION_CONFIG.IDLE_TTL_MS - 1000;
		manager.pruneIdleSessions(Date.now());

		const metrics = manager.getMetrics();
		expect(metrics.totalSessions).toBe(0);
	});

	it("caps total sessions to the configured maximum", () => {
		const manager = new SessionManager({ enabled: true });

		const totalSessions = SESSION_CONFIG.MAX_ENTRIES + 5;
		for (let index = 0; index < totalSessions; index += 1) {
			const body = createBody(`conv-cap-${index}`);
			let context = manager.getContext(body) as SessionContext;
			context = manager.applyRequest(body, context) as SessionContext;
			context.state.lastUpdated -= index; // ensure ordering
		}

		const metrics = manager.getMetrics(SESSION_CONFIG.MAX_ENTRIES + 10);
		expect(metrics.totalSessions).toBe(SESSION_CONFIG.MAX_ENTRIES);
		expect(metrics.recentSessions.length).toBeLessThanOrEqual(SESSION_CONFIG.MAX_ENTRIES);
	});

	it("applies compacted history when summary stored", () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody("conv-compaction");
		let context = manager.getContext(body) as SessionContext;
		context = manager.applyRequest(body, context) as SessionContext;

		const systemMessage: InputItem = { type: "message", role: "system", content: "env" };
		manager.applyCompactionSummary(context, {
			baseSystem: [systemMessage],
			summary: "Auto-compaction summary",
		});

		const nextBody = createBody("conv-compaction");
		nextBody.input = [{ type: "message", role: "user", content: "new task" }];
		manager.applyCompactedHistory(nextBody, context);

		expect(nextBody.input).toHaveLength(3);
		expect(nextBody.input?.[0].role).toBe("system");
		expect(nextBody.input?.[1].role).toBe("user");
		expect(nextBody.input?.[1].content).toContain("Auto-compaction summary");
		expect(nextBody.input?.[2].content).toBe("new task");
	});
});
