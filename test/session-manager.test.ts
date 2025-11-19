import { describe, expect, it } from "vitest";
import { SESSION_CONFIG } from "../lib/constants.js";
import { SessionManager } from "../lib/session/session-manager.js";
import type { InputItem, RequestBody, SessionContext } from "../lib/types.js";

interface BodyOptions {
	forkId?: string;
}

function createBody(conversationId: string, inputCount = 1, options: BodyOptions = {}): RequestBody {
	const metadata: Record<string, unknown> = {
		conversation_id: conversationId,
	};
	if (options.forkId) {
		metadata.forkId = options.forkId;
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
