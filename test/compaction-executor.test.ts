import { describe, expect, it, vi } from 'vitest';
import type { SessionManager } from '../lib/session/session-manager.js';
import type { SessionContext } from '../lib/types.js';
import { finalizeCompactionResponse, type CompactionDecision } from '../lib/compaction/compaction-executor.js';
import { CODEX_SUMMARY_PREFIX } from '../lib/prompts/codex-compaction.js';

describe('Compaction executor', () => {
	it('rewrites auto compaction output, metadata, and persists summary', async () => {
		const initialPayload = {
			output: [
				{
					role: 'assistant',
					content: [
						{
							type: 'output_text',
							text: 'Original reasoning',
						},
					],
				},
			],
			metadata: { version: 1 },
		};
		const decision: CompactionDecision = {
			mode: 'auto',
			reason: 'token limit',
			preservedSystem: [
				{ type: 'message', role: 'system', content: 'system instructions' },
			],
			serialization: {
				transcript: 'transcript',
				totalTurns: 3,
				droppedTurns: 1,
			},
		};
		const response = new Response(JSON.stringify(initialPayload), {
			status: 202,
			statusText: 'Accepted',
			headers: { 'x-custom': 'header' },
		});
		const sessionManager = { applyCompactionSummary: vi.fn() } as unknown as SessionManager;
		const sessionContext: SessionContext = {
			sessionId: 'session-abc',
			enabled: true,
			preserveIds: true,
			isNew: false,
			state: {
				id: 'session-abc',
				promptCacheKey: 'prompt-abc',
				store: false,
				lastInput: [],
				lastPrefixHash: null,
				lastUpdated: Date.now(),
			},
		};

		const finalized = await finalizeCompactionResponse({
			response,
			decision,
			sessionManager,
			sessionContext,
		});

		expect(finalized.status).toBe(202);
		expect(finalized.statusText).toBe('Accepted');
		expect(finalized.headers.get('x-custom')).toBe('header');

		const body = JSON.parse(await finalized.text());
		expect(body.output[0].content[0].text).toContain('Auto compaction triggered (token limit)');
		expect(body.output[0].content[0].text).toContain(CODEX_SUMMARY_PREFIX);
		expect(body.metadata.codex_compaction).toMatchObject({
			mode: 'auto',
			reason: 'token limit',
			total_turns: 3,
			dropped_turns: 1,
		});
		expect(sessionManager.applyCompactionSummary).toHaveBeenCalledWith(sessionContext, {
			baseSystem: decision.preservedSystem,
			summary: expect.stringContaining(CODEX_SUMMARY_PREFIX),
		});
	});

	it('gracefully handles payloads without assistant output', async () => {
		const emptyPayload = { output: [], metadata: {} };
		const decision: CompactionDecision = {
			mode: 'command',
			preservedSystem: [],
			serialization: { transcript: '', totalTurns: 0, droppedTurns: 0 },
		};
		const response = new Response(JSON.stringify(emptyPayload), {
			status: 200,
		});

		const finalized = await finalizeCompactionResponse({ response, decision });
		const body = JSON.parse(await finalized.text());

		expect(finalized.status).toBe(200);
		expect(body.output).toEqual([]);
		expect(body.metadata.codex_compaction).toMatchObject({
			mode: 'command',
			dropped_turns: 0,
			total_turns: 0,
		});
	});

	it('does not add auto note when compaction is command-based', async () => {
		const payload = {
			output: [
				{
					role: 'assistant',
					content: [
						{ type: 'output_text', text: 'Previous might' },
					],
				},
			],
			metadata: {},
		};
		const decision: CompactionDecision = {
			mode: 'command',
			preservedSystem: [],
			serialization: { transcript: '', totalTurns: 1, droppedTurns: 0 },
		};
		const response = new Response(JSON.stringify(payload), {
			status: 200,
		});

		const finalized = await finalizeCompactionResponse({ response, decision });
		const body = JSON.parse(await finalized.text());

		expect(body.output[0].content[0].text).toContain(CODEX_SUMMARY_PREFIX);
		expect(body.output[0].content[0].text).not.toContain('Auto compaction triggered');
		expect(body.metadata.codex_compaction.mode).toBe('command');
		expect(body.metadata.codex_compaction.reason).toBeUndefined();
	});
});
