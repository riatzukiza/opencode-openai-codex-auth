import { describe, it, expect } from 'vitest';
import { SessionManager } from '../lib/session/session-manager.js';
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
});
