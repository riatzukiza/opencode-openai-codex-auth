import { describe, it, expect } from 'vitest';
import { SessionManager, SESSION_IDLE_TTL_MS, SESSION_MAX_ENTRIES } from '../lib/session/session-manager.js';
import type { RequestBody, SessionContext } from '../lib/types.js';

function createBody(conversationId: string, inputCount = 1): RequestBody {
	return {
		model: 'gpt-5',
		metadata: {
			conversation_id: conversationId,
		},
		input: Array.from({ length: inputCount }, (_, index) => ({
			type: 'message',
			role: 'user',
			id: `msg_${index + 1}`,
			content: `message-${index + 1}`,
		})),
	};
}

describe('SessionManager', () => {
	it('returns undefined when disabled', () => {
		const manager = new SessionManager({ enabled: false });
		const body = createBody('conv-disabled');
		const context = manager.getContext(body);

		expect(context).toBeUndefined();
	});

	it('initializes session and preserves ids when enabled', () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody('conv-123');

		let context = manager.getContext(body) as SessionContext;
		expect(context.enabled).toBe(true);
		expect(context.isNew).toBe(true);
		expect(context.preserveIds).toBe(true);
		expect(context.state.promptCacheKey).toBe('conv-123');

		context = manager.applyRequest(body, context) as SessionContext;
		expect(body.prompt_cache_key).toBe('conv-123');
		expect(context.state.lastInput.length).toBe(1);
	});

	it('maintains prefix across turns and reuses context', () => {
		const manager = new SessionManager({ enabled: true });
		const firstBody = createBody('conv-456');

		let context = manager.getContext(firstBody) as SessionContext;
		context = manager.applyRequest(firstBody, context) as SessionContext;

		const secondBody = createBody('conv-456', 2);
		let nextContext = manager.getContext(secondBody) as SessionContext;
		expect(nextContext.isNew).toBe(false);
		nextContext = manager.applyRequest(secondBody, nextContext) as SessionContext;

		expect(secondBody.prompt_cache_key).toBe('conv-456');
		expect(nextContext.state.lastInput.length).toBe(2);
		expect(nextContext.state.promptCacheKey).toBe(context.state.promptCacheKey);
	});

	it('regenerates cache key when prefix differs', () => {
		const manager = new SessionManager({ enabled: true });
		const baseBody = createBody('conv-789', 2);

		let context = manager.getContext(baseBody) as SessionContext;
		context = manager.applyRequest(baseBody, context) as SessionContext;

		const branchBody: RequestBody = {
			model: 'gpt-5',
			metadata: { conversation_id: 'conv-789' },
			input: [
				{
					type: 'message',
					role: 'user',
					id: 'new_msg',
					content: 'fresh-start',
				},
			],
		};

		let branchContext = manager.getContext(branchBody) as SessionContext;
		branchContext = manager.applyRequest(branchBody, branchContext) as SessionContext;

		expect(branchBody.prompt_cache_key).toMatch(/^cache_/);
		expect(branchContext.isNew).toBe(true);
		expect(branchContext.state.promptCacheKey).not.toBe(context.state.promptCacheKey);
	});

	it('records cached token usage from response payload', () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody('conv-usage');

		let context = manager.getContext(body) as SessionContext;
		context = manager.applyRequest(body, context) as SessionContext;

		manager.recordResponse(context, { usage: { cached_tokens: 42 } });

		expect(context.state.lastCachedTokens).toBe(42);
	});

	it('reports metrics snapshot with recent sessions', () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody('conv-metrics');
		let context = manager.getContext(body) as SessionContext;
		context = manager.applyRequest(body, context) as SessionContext;

		const metrics = manager.getMetrics();
		expect(metrics.enabled).toBe(true);
		expect(metrics.totalSessions).toBe(1);
		expect(metrics.recentSessions[0].id).toBe('conv-metrics');
	});

	it('falls back to prompt_cache_key when metadata missing', () => {
		const manager = new SessionManager({ enabled: true });
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
			prompt_cache_key: 'fallback_cache_key',
		};

		let context = manager.getContext(body) as SessionContext;
		expect(context.enabled).toBe(true);
		expect(context.isNew).toBe(true);
		expect(context.state.promptCacheKey).toBe('fallback_cache_key');
	});

	it('reuses session when prompt_cache_key matches existing', () => {
		const manager = new SessionManager({ enabled: true });
		const cacheKey = 'persistent_key_789';
		
		// First request creates session
		const firstBody: RequestBody = {
			model: 'gpt-5',
			input: [],
			prompt_cache_key: cacheKey,
		};
		let firstContext = manager.getContext(firstBody) as SessionContext;
		expect(firstContext.isNew).toBe(true);
		
		// Second request reuses session
		const secondBody: RequestBody = {
			model: 'gpt-5',
			input: [{ type: 'message', role: 'user', content: 'second' }],
			prompt_cache_key: cacheKey,
		};
		let secondContext = manager.getContext(secondBody) as SessionContext;
		expect(secondContext.isNew).toBe(false);
		expect(secondContext.state.promptCacheKey).toBe(firstContext.state.promptCacheKey);
	});

	it('evicts sessions that exceed idle TTL', () => {
		const manager = new SessionManager({ enabled: true });
		const body = createBody('conv-expire');
		let context = manager.getContext(body) as SessionContext;
		context = manager.applyRequest(body, context) as SessionContext;

		context.state.lastUpdated = Date.now() - SESSION_IDLE_TTL_MS - 1000;
		manager.pruneIdleSessions(Date.now());

		const metrics = manager.getMetrics();
		expect(metrics.totalSessions).toBe(0);
	});

	it('caps total sessions to the configured maximum', () => {
		const manager = new SessionManager({ enabled: true });

		const totalSessions = SESSION_MAX_ENTRIES + 5;
		for (let index = 0; index < totalSessions; index += 1) {
			const body = createBody(`conv-cap-${index}`);
			let context = manager.getContext(body) as SessionContext;
			context = manager.applyRequest(body, context) as SessionContext;
			context.state.lastUpdated -= index; // ensure ordering
		}

		const metrics = manager.getMetrics(SESSION_MAX_ENTRIES + 10);
		expect(metrics.totalSessions).toBe(SESSION_MAX_ENTRIES);
		expect(metrics.recentSessions.length).toBeLessThanOrEqual(SESSION_MAX_ENTRIES);
	});
});
