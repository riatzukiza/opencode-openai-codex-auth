import { describe, it, expect } from 'vitest';
import {
	normalizeModel,
	getModelConfig,
	getReasoningConfig,
	filterInput,
	addToolRemapMessage,
	isOpenCodeSystemPrompt,
	filterOpenCodeSystemPrompts,
	addCodexBridgeMessage,
	transformRequestBody,
} from '../lib/request/request-transformer.js';
import type { RequestBody, UserConfig, InputItem } from '../lib/types.js';

async function runTransform(
	body: RequestBody,
	codexInstructions: string,
	userConfig?: UserConfig,
	codexMode = true,
	options?: Record<string, unknown>,
	sessionContext?: any,
) {
	const result = await transformRequestBody(body, codexInstructions, userConfig, codexMode, options, sessionContext);
	return result.body;
}

describe('normalizeModel', () => {
	it('should normalize gpt-5', async () => {
		expect(normalizeModel('gpt-5')).toBe('gpt-5');
	});

	it('should normalize variants containing "codex"', async () => {
		expect(normalizeModel('openai/gpt-5-codex')).toBe('gpt-5-codex');
		expect(normalizeModel('custom-gpt-5-codex-variant')).toBe('gpt-5-codex');
	});

	it('should normalize variants containing "gpt-5"', async () => {
		expect(normalizeModel('gpt-5-mini')).toBe('gpt-5');
		expect(normalizeModel('gpt-5-nano')).toBe('gpt-5');
	});

	it('should return gpt-5.1 as default for unknown models', async () => {
		expect(normalizeModel('unknown-model')).toBe('gpt-5.1');
		expect(normalizeModel('gpt-4')).toBe('gpt-5.1');
	});

	it('should return gpt-5.1 for undefined', async () => {
		expect(normalizeModel(undefined)).toBe('gpt-5.1');
	});

	it('should normalize all gpt-5 presets to gpt-5', async () => {
		expect(normalizeModel('gpt-5-minimal')).toBe('gpt-5');
		expect(normalizeModel('gpt-5-low')).toBe('gpt-5');
		expect(normalizeModel('gpt-5-medium')).toBe('gpt-5');
		expect(normalizeModel('gpt-5-high')).toBe('gpt-5');
	});

	it('should prioritize codex over gpt-5 in model name', async () => {
		// Model name contains BOTH "codex" and "gpt-5"
		// Should return "gpt-5-codex" (codex checked first)
		expect(normalizeModel('gpt-5-codex-low')).toBe('gpt-5-codex');
		expect(normalizeModel('my-gpt-5-codex-model')).toBe('gpt-5-codex');
	});

	it('should normalize codex mini presets to gpt-5.1-codex-mini', async () => {
		expect(normalizeModel('gpt-5-codex-mini')).toBe('gpt-5.1-codex-mini');
		expect(normalizeModel('gpt-5-codex-mini-medium')).toBe('gpt-5.1-codex-mini');
		expect(normalizeModel('gpt-5-codex-mini-high')).toBe('gpt-5.1-codex-mini');
		expect(normalizeModel('openai/gpt-5-codex-mini-high')).toBe('gpt-5.1-codex-mini');
	});

	it('should normalize raw codex-mini-latest slug to gpt-5.1-codex-mini', async () => {
		expect(normalizeModel('codex-mini-latest')).toBe('gpt-5.1-codex-mini');
		expect(normalizeModel('openai/codex-mini-latest')).toBe('gpt-5.1-codex-mini');
	});

	it('should normalize gpt-5.1 general presets to gpt-5.1', async () => {
		expect(normalizeModel('gpt-5.1')).toBe('gpt-5.1');
		expect(normalizeModel('gpt-5.1-medium')).toBe('gpt-5.1');
		expect(normalizeModel('gpt51-high')).toBe('gpt-5.1');
		expect(normalizeModel('gpt 5.1 none')).toBe('gpt-5.1');
	});

	it('should normalize gpt-5.1 codex presets to gpt-5.1-codex', async () => {
		expect(normalizeModel('gpt-5.1-codex-low')).toBe('gpt-5.1-codex');
		expect(normalizeModel('gpt51-codex')).toBe('gpt-5.1-codex');
		expect(normalizeModel('openai/gpt-5.1-codex-high')).toBe('gpt-5.1-codex');
	});

	it('should normalize gpt-5.1 codex mini presets to gpt-5.1-codex-mini', async () => {
		expect(normalizeModel('gpt-5.1-codex-mini')).toBe('gpt-5.1-codex-mini');
		expect(normalizeModel('gpt-5.1-codex-mini-medium')).toBe('gpt-5.1-codex-mini');
		expect(normalizeModel('gpt51-codex-mini-high')).toBe('gpt-5.1-codex-mini');
	});

	it('should handle mixed case', async () => {
		expect(normalizeModel('Gpt-5-Codex-Low')).toBe('gpt-5-codex');
		expect(normalizeModel('GpT-5-MeDiUm')).toBe('gpt-5');
	});

	it('should handle special characters', async () => {
		expect(normalizeModel('my_gpt-5_codex')).toBe('gpt-5-codex');
		expect(normalizeModel('gpt.5.high')).toBe('gpt-5');
	});

	it('should handle old verbose names', async () => {
		expect(normalizeModel('GPT 5 Codex Low (ChatGPT Subscription)')).toBe('gpt-5-codex');
		expect(normalizeModel('GPT 5 High (ChatGPT Subscription)')).toBe('gpt-5');
	});

	it('should handle empty string', async () => {
		expect(normalizeModel('')).toBe('gpt-5.1');
	});
});

describe('getReasoningConfig (gpt-5.1)', () => {
	it('defaults gpt-5.1 to none when no overrides are provided', async () => {
		const result = getReasoningConfig('gpt-5.1', {});
		expect(result.effort).toBe('none');
		expect(result.summary).toBe('auto');
	});

	it('maps unsupported none effort to low for gpt-5.1-codex', async () => {
		const result = getReasoningConfig('gpt-5.1-codex', { reasoningEffort: 'none' });
		expect(result.effort).toBe('low');
	});

	it('enforces medium minimum effort for gpt-5.1-codex-mini', async () => {
		const result = getReasoningConfig('gpt-5.1-codex-mini', { reasoningEffort: 'low' });
		expect(result.effort).toBe('medium');
	});

	it('downgrades none to minimal on legacy gpt-5 models', async () => {
		const result = getReasoningConfig('gpt-5', { reasoningEffort: 'none' });
		expect(result.effort).toBe('minimal');
	});
});

describe('filterInput', () => {
	it('should handle null/undefined in filterInput', async () => {
		expect(filterInput(null as any)).toBeNull();
		expect(filterInput(undefined)).toBeUndefined();
		expect(filterInput([])).toEqual([]);
	});

	it('should handle malformed input in filterInput', async () => {
		const malformedInput = { notAnArray: true } as any;
		expect(filterInput(malformedInput)).toBe(malformedInput);
	});

	it('should keep items without IDs unchanged', async () => {
		const input: InputItem[] = [
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = filterInput(input);
		expect(result).toEqual(input);
		expect(result![0]).not.toHaveProperty('id');
	});

	it('should remove ALL message IDs (rs_, msg_, etc.) for store:false compatibility', async () => {
		const input: InputItem[] = [
			{ id: 'rs_123', type: 'message', role: 'assistant', content: 'hello' },
			{ id: 'msg_456', type: 'message', role: 'user', content: 'world' },
			{ id: 'assistant_789', type: 'message', role: 'assistant', content: 'test' },
		];
		const result = filterInput(input);

		// All items should remain (no filtering), but ALL IDs removed
		expect(result).toHaveLength(3);
		expect(result![0]).not.toHaveProperty('id');
		expect(result![1]).not.toHaveProperty('id');
		expect(result![2]).not.toHaveProperty('id');
		expect(result![0].content).toBe('hello');
		expect(result![1].content).toBe('world');
		expect(result![2].content).toBe('test');
	});

	it('removes metadata when normalizing stateless input', async () => {
		const input: InputItem[] = [
			{
				id: 'msg_123',
				type: 'message',
				role: 'user',
				content: 'test',
				metadata: { some: 'data' }
			},
		];
		const result = filterInput(input);

		expect(result).toHaveLength(1);
		expect(result![0]).not.toHaveProperty('id');
		expect(result![0].type).toBe('message');
		expect(result![0].role).toBe('user');
		expect(result![0].content).toBe('test');
		expect(result![0]).not.toHaveProperty('metadata');
	});

	it('preserves metadata when IDs are preserved for host caching', async () => {
		const input: InputItem[] = [
			{
				id: 'msg_123',
				type: 'message',
				role: 'user',
				content: 'test',
				metadata: { some: 'data' }
			},
		];
		const result = filterInput(input, { preserveIds: true });

		expect(result).toHaveLength(1);
		expect(result![0]).toHaveProperty('id', 'msg_123');
		expect(result![0]).toHaveProperty('metadata');
	});

	it('should handle mixed items with and without IDs', async () => {
		const input: InputItem[] = [
			{ type: 'message', role: 'user', content: '1' },
			{ id: 'rs_stored', type: 'message', role: 'assistant', content: '2' },
			{ id: 'msg_123', type: 'message', role: 'user', content: '3' },
		];
		const result = filterInput(input);

		// All items kept, IDs removed from items that had them
		expect(result).toHaveLength(3);
		expect(result![0]).not.toHaveProperty('id');
		expect(result![1]).not.toHaveProperty('id');
		expect(result![2]).not.toHaveProperty('id');
		expect(result![0].content).toBe('1');
		expect(result![1].content).toBe('2');
		expect(result![2].content).toBe('3');
	});

	it('should handle custom ID formats (future-proof)', async () => {
		const input: InputItem[] = [
			{ id: 'custom_id_format', type: 'message', role: 'user', content: 'test' },
			{ id: 'another-format-123', type: 'message', role: 'user', content: 'test2' },
		];
		const result = filterInput(input);

		expect(result).toHaveLength(2);
		expect(result![0]).not.toHaveProperty('id');
		expect(result![1]).not.toHaveProperty('id');
	});

	it('should return undefined for undefined input', async () => {
		expect(filterInput(undefined)).toBeUndefined();
	});

	it('should return non-array input as-is', async () => {
		const notArray = { notAnArray: true };
		expect(filterInput(notArray as any)).toBe(notArray);
	});

	it('should handle empty array', async () => {
		const input: InputItem[] = [];
		const result = filterInput(input);
		expect(result).toEqual([]);
	});
});

describe('getModelConfig', () => {
	describe('Per-model options (Bug Fix Verification)', () => {
		it('should find per-model options using config key', async () => {
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'medium' },
				models: {
					'gpt-5-codex-low': {
						options: { reasoningEffort: 'low', textVerbosity: 'low' }
					}
				}
			};

			const result = getModelConfig('gpt-5-codex-low', userConfig);
			expect(result.reasoningEffort).toBe('low');
			expect(result.textVerbosity).toBe('low');
		});

		it('should merge global and per-model options (per-model wins)', async () => {
			const userConfig: UserConfig = {
				global: {
					reasoningEffort: 'medium',
					textVerbosity: 'medium',
					include: ['reasoning.encrypted_content']
				},
				models: {
					'gpt-5-codex-high': {
						options: { reasoningEffort: 'high' }  // Override only effort
					}
				}
			};

			const result = getModelConfig('gpt-5-codex-high', userConfig);
			expect(result.reasoningEffort).toBe('high');  // From per-model
			expect(result.textVerbosity).toBe('medium');  // From global
			expect(result.include).toEqual(['reasoning.encrypted_content']);  // From global
		});

		it('should return global options when model not in config', async () => {
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'medium' },
				models: {
					'gpt-5-codex-low': { options: { reasoningEffort: 'low' } }
				}
			};

			// Looking up different model
			const result = getModelConfig('gpt-5-codex', userConfig);
			expect(result.reasoningEffort).toBe('medium');  // Global only
		});

		it('should handle empty config', async () => {
			const result = getModelConfig('gpt-5-codex', { global: {}, models: {} });
			expect(result).toEqual({});
		});

		it('should handle missing models object', async () => {
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'low' },
				models: undefined as any
			};
			const result = getModelConfig('gpt-5', userConfig);
			expect(result.reasoningEffort).toBe('low');
		});

		it('should handle boundary conditions in getModelConfig', async () => {
			// Test with empty models object
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'high' },
				models: {} as any
			};
			const result = getModelConfig('gpt-5-codex', userConfig);
			expect(result.reasoningEffort).toBe('high');
		});

		it('should handle undefined global config in getModelConfig', async () => {
			const userConfig: UserConfig = {
				global: undefined as any,
				models: {}
			};
			const result = getModelConfig('gpt-5', userConfig);
			expect(result).toEqual({});
		});
	});

	describe('Backwards compatibility', () => {
		it('should work with old verbose config keys', async () => {
			const userConfig: UserConfig = {
				global: {},
				models: {
					'GPT 5 Codex Low (ChatGPT Subscription)': {
						options: { reasoningEffort: 'low' }
					}
				}
			};

			const result = getModelConfig('GPT 5 Codex Low (ChatGPT Subscription)', userConfig);
			expect(result.reasoningEffort).toBe('low');
		});

		it('should work with old configs that have id field', async () => {
			const userConfig: UserConfig = {
				global: {},
				models: {
					'gpt-5-codex-low': ({
						id: 'gpt-5-codex',  // id field present but should be ignored
						options: { reasoningEffort: 'low' }
					} as any)
				}
			};

			const result = getModelConfig('gpt-5-codex-low', userConfig);
			expect(result.reasoningEffort).toBe('low');
		});
	});

	describe('Default models (no custom config)', () => {
		it('should return global options for default gpt-5-codex', async () => {
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'high' },
				models: {}
			};

			const result = getModelConfig('gpt-5-codex', userConfig);
			expect(result.reasoningEffort).toBe('high');
		});

		it('should return empty when no config at all', async () => {
			const result = getModelConfig('gpt-5', undefined);
			expect(result).toEqual({});
		});
	});
});

describe('addToolRemapMessage', () => {
	it('should prepend tool remap message when tools present', async () => {
		const input: InputItem[] = [
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = addToolRemapMessage(input, true);

		expect(result).toHaveLength(2);
		expect(result![0].role).toBe('developer');
		expect(result![0].type).toBe('message');
		expect((result![0].content as any)[0].text).toContain('apply_patch');
	});

	it('should not modify input when tools not present', async () => {
		const input: InputItem[] = [
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = addToolRemapMessage(input, false);
		expect(result).toEqual(input);
	});

	it('should return undefined for undefined input', async () => {
		expect(addToolRemapMessage(undefined, true)).toBeUndefined();
	});

	it('should handle non-array input', async () => {
		const notArray = { notAnArray: true };
		expect(addToolRemapMessage(notArray as any, true)).toBe(notArray);
	});
});

describe('isOpenCodeSystemPrompt', () => {
	it('should detect OpenCode system prompt with string content', async () => {
		const item: InputItem = {
			type: 'message',
			role: 'developer',
			content: 'You are a coding agent running in OpenCode',
		};
		expect(isOpenCodeSystemPrompt(item, null)).toBe(true);
	});

	it('should detect OpenCode system prompt with array content', async () => {
		const item: InputItem = {
			type: 'message',
			role: 'developer',
			content: [
				{
					type: 'input_text',
					text: 'You are a coding agent running in OpenCode',
				},
			],
		};
		expect(isOpenCodeSystemPrompt(item, null)).toBe(true);
	});

	it('should detect with system role', async () => {
		const item: InputItem = {
			type: 'message',
			role: 'system',
			content: 'You are a coding agent running in OpenCode',
		};
		expect(isOpenCodeSystemPrompt(item, null)).toBe(true);
	});

	it('should not detect non-system roles', async () => {
		const item: InputItem = {
			type: 'message',
			role: 'user',
			content: 'You are a coding agent running in OpenCode',
		};
		expect(isOpenCodeSystemPrompt(item, null)).toBe(false);
	});

	it('should not detect different content', async () => {
		const item: InputItem = {
			type: 'message',
			role: 'developer',
			content: 'Different message',
		};
		expect(isOpenCodeSystemPrompt(item, null)).toBe(false);
	});

	it('should NOT detect AGENTS.md content', async () => {
		const item: InputItem = {
			type: 'message',
			role: 'developer',
			content: '# Project Guidelines\n\nThis is custom AGENTS.md content for the project.',
		};
		expect(isOpenCodeSystemPrompt(item, null)).toBe(false);
	});

	it('should NOT detect environment info concatenated with AGENTS.md', async () => {
		const item: InputItem = {
			type: 'message',
			role: 'developer',
			content: 'Environment: /path/to/project\nDate: 2025-01-01\n\n# AGENTS.md\n\nCustom instructions here.',
		};
		expect(isOpenCodeSystemPrompt(item, null)).toBe(false);
	});

	it('should NOT detect content with codex signature in the middle', async () => {
		const cachedPrompt = 'You are a coding agent running in OpenCode.';
		const item: InputItem = {
			type: 'message',
			role: 'developer',
			// Has codex.txt content but with environment prepended (like OpenCode does)
			content: 'Environment info here\n\nYou are a coding agent running in OpenCode.',
		};
		// First 200 chars won't match because of prepended content
		expect(isOpenCodeSystemPrompt(item, cachedPrompt)).toBe(false);
	});

	it('should detect with cached prompt exact match', async () => {
		const cachedPrompt = 'You are a coding agent running in OpenCode';
		const item: InputItem = {
			type: 'message',
			role: 'developer',
			content: 'You are a coding agent running in OpenCode',
		};
		expect(isOpenCodeSystemPrompt(item, cachedPrompt)).toBe(true);
	});
});

describe('filterOpenCodeSystemPrompts', () => {
	it('should filter out OpenCode system prompts', async () => {
		const input: InputItem[] = [
			{
				type: 'message',
				role: 'developer',
				content: 'You are a coding agent running in OpenCode',
			},
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = await filterOpenCodeSystemPrompts(input);
		expect(result).toHaveLength(1);
		expect(result![0].role).toBe('user');
	});

	it('should keep user messages', async () => {
		const input: InputItem[] = [
			{ type: 'message', role: 'user', content: 'message 1' },
			{ type: 'message', role: 'user', content: 'message 2' },
		];
		const result = await filterOpenCodeSystemPrompts(input);
		expect(result).toHaveLength(2);
	});

	it('should keep non-OpenCode developer messages', async () => {
		const input: InputItem[] = [
			{ type: 'message', role: 'developer', content: 'Custom instruction' },
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = await filterOpenCodeSystemPrompts(input);
		expect(result).toHaveLength(2);
	});

	it('should keep AGENTS.md content (not filter it)', async () => {
		const input: InputItem[] = [
			{
				type: 'message',
				role: 'developer',
				content: 'You are a coding agent running in OpenCode', // This is codex.txt
			},
			{
				type: 'message',
				role: 'developer',
				content: '# Project Guidelines\n\nThis is AGENTS.md content.', // This is AGENTS.md
			},
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = await filterOpenCodeSystemPrompts(input);
		// Should filter codex.txt but keep AGENTS.md
		expect(result).toHaveLength(2);
		expect(result![0].content).toContain('AGENTS.md');
		expect(result![1].role).toBe('user');
	});

	it('should keep environment+AGENTS.md concatenated message', async () => {
		const input: InputItem[] = [
			{
				type: 'message',
				role: 'developer',
				content: 'You are a coding agent running in OpenCode', // codex.txt alone
			},
			{
				type: 'message',
				role: 'developer',
				// environment + AGENTS.md joined (like OpenCode does)
				content: 'Working directory: /path/to/project\nDate: 2025-01-01\n\n# AGENTS.md\n\nCustom instructions.',
			},
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = await filterOpenCodeSystemPrompts(input);
		// Should filter first message (codex.txt) but keep second (env+AGENTS.md)
		expect(result).toHaveLength(2);
		expect(result![0].content).toContain('AGENTS.md');
		expect(result![1].role).toBe('user');
	});

	it('should preserve auto-compaction summaries but drop file instructions', async () => {
		const input: InputItem[] = [
			{
				type: 'message',
				role: 'developer',
				content: [
					{ type: 'input_text', text: 'Auto-compaction summary saved to ~/.opencode/summaries/session.md' },
					{ type: 'input_text', text: '- Built caching layer and refreshed metrics.' },
					{ type: 'input_text', text: 'Open the summary file for the full log.' },
				],
			},
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = await filterOpenCodeSystemPrompts(input);
		expect(result).toHaveLength(2);
		const summary = result![0];
		expect(summary.role).toBe('developer');
		expect(typeof summary.content).toBe('string');
		const summaryText = summary.content as string;
		expect(summaryText).toContain('Auto-compaction summary');
		expect(summaryText).toContain('Built caching layer');
		expect(summaryText).not.toContain('~/.opencode');
		expect(summaryText).not.toContain('summary file');
	});

	it('should drop compaction prompts that only reference summary files', async () => {
		const input: InputItem[] = [
			{
				type: 'message',
				role: 'developer',
				content: 'Auto-compaction triggered. Write the summary to summary_file.',
			},
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = await filterOpenCodeSystemPrompts(input);
		expect(result).toHaveLength(1);
		expect(result![0].role).toBe('user');
	});

	it('should return undefined for undefined input', async () => {
		expect(await filterOpenCodeSystemPrompts(undefined)).toBeUndefined();
	});
});

describe('compaction integration', () => {
		const instructions = 'Codex instructions';

		it('rewrites input when manual codex-compact command is present', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{ type: 'message', role: 'developer', content: 'AGENTS' },
					{ type: 'message', role: 'user', content: 'Do work' },
					{ type: 'message', role: 'user', content: '/codex-compact' },
				],
			};
			const original = body.input!.map((item) => JSON.parse(JSON.stringify(item)));
			const result = await transformRequestBody(body, instructions, undefined, true, {
				compaction: {
					settings: { enabled: true, autoLimitTokens: undefined, autoMinMessages: 8 },
					commandText: 'codex-compact',
					originalInput: original,
				},
			});

			expect(result.compactionDecision?.mode).toBe('command');
			expect(result.body.input).toHaveLength(2);
			expect(result.body.tools).toBeUndefined();
		});

		it('auto-compacts when token limit exceeded', async () => {
			const longUser = 'lorem ipsum '.repeat(200);
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{ type: 'message', role: 'user', content: longUser },
					{ type: 'message', role: 'assistant', content: 'ack' },
				],
			};
			const original = body.input!.map((item) => JSON.parse(JSON.stringify(item)));
			const result = await transformRequestBody(body, instructions, undefined, true, {
				compaction: {
					settings: { enabled: true, autoLimitTokens: 10, autoMinMessages: 1 },
					commandText: null,
					originalInput: original,
				},
			});

			expect(result.compactionDecision?.mode).toBe('auto');
			expect(result.body.input).toHaveLength(2);
		});
	});

describe('addCodexBridgeMessage', () => {
	it('should prepend bridge message when tools present', async () => {
		const input = [
			{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'test' }] },
		];
		const result = addCodexBridgeMessage(input, true);

		expect(result).toHaveLength(2);
		expect(result![0].role).toBe('developer');
		expect(result![0].type).toBe('message');
		expect((result![0].content as any)[0].text).toContain('Codex in OpenCode');
	});

	it('should not modify input when tools not present', async () => {
		const input: InputItem[] = [
			{ type: 'message', role: 'user', content: 'hello' },
		];
		const result = addCodexBridgeMessage(input, false);
		expect(result).toEqual(input);
	});

	it('should return undefined for undefined input', async () => {
		expect(addCodexBridgeMessage(undefined, true)).toBeUndefined();
	});
});

describe('runTransform', () => {
	const codexInstructions = 'Test Codex Instructions';

	it('preserves existing prompt_cache_key passed by host (OpenCode)', async () => {
		const body: RequestBody = {
			model: 'gpt-5-codex',
			input: [],
			// Host-provided key (OpenCode session id)
			// host-provided field is allowed by plugin
			prompt_cache_key: 'ses_host_key_123',
		};
		const result: any = await runTransform(body, codexInstructions);
		expect(result.prompt_cache_key).toBe('ses_host_key_123');
	});

	it('preserves promptCacheKey (camelCase) from host', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
			promptCacheKey: 'ses_camel_key_456',
		};
		const result: any = await runTransform(body, codexInstructions);
		expect(result.prompt_cache_key).toBe('ses_camel_key_456');
	});

	it('derives prompt_cache_key from metadata when host omits one', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
			metadata: { conversation_id: 'meta-conv-123' },
		};
		const result: any = await runTransform(body, codexInstructions);
		expect(result.prompt_cache_key).toBe('meta-conv-123');
	});

	it('derives fork-aware prompt_cache_key when fork id is present in metadata', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
			metadata: { conversation_id: 'meta-conv-123', forkId: 'branch-1' },
		};
		const result: any = await runTransform(body, codexInstructions);
		expect(result.prompt_cache_key).toBe('meta-conv-123::fork::branch-1');
	});

	it('derives fork-aware prompt_cache_key when fork id is present in root', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
			metadata: { conversation_id: 'meta-conv-123' },
			forkId: 'branch-2' as any,
		} as any;
		const result: any = await runTransform(body, codexInstructions);
		expect(result.prompt_cache_key).toBe('meta-conv-123::fork::branch-2');
	});

	it('reuses the same prompt_cache_key across non-structural overrides', async () => {
		const baseMetadata = { conversation_id: 'meta-conv-789', forkId: 'fork-x' };
		const body1: RequestBody = {
			model: 'gpt-5',
			input: [],
			metadata: { ...baseMetadata },
		};
		const body2: RequestBody = {
			model: 'gpt-5',
			input: [],
			metadata: { ...baseMetadata },
			// Soft overrides that should not change the cache key
			max_output_tokens: 1024,
			reasoning: { effort: 'high' } as any,
			text: { verbosity: 'high' } as any,
		};

		const result1: any = await runTransform(body1, codexInstructions);
		const result2: any = await runTransform(body2, codexInstructions);

		expect(result1.prompt_cache_key).toBe('meta-conv-789::fork::fork-x');
		expect(result2.prompt_cache_key).toBe('meta-conv-789::fork::fork-x');
	});

	it('generates fallback prompt_cache_key when no identifiers exist', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const result: any = await runTransform(body, codexInstructions);
		expect(typeof result.prompt_cache_key).toBe('string');
		expect(result.prompt_cache_key).toMatch(/^cache_/);
	});

	it('should set required Codex fields', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const result = await runTransform(body, codexInstructions);

		expect(result.store).toBe(false);
		expect(result.stream).toBe(true);
		expect(result.instructions).toBe(codexInstructions);
	});

	it('should normalize model name', async () => {
		const body: RequestBody = {
			model: 'gpt-5-mini',
			input: [],
		};
		const result = await runTransform(body, codexInstructions);
		expect(result.model).toBe('gpt-5');
	});

	it('should apply default reasoning config', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const result = await runTransform(body, codexInstructions);

		expect(result.reasoning?.effort).toBe('medium');
		expect(result.reasoning?.summary).toBe('auto');
	});

	it('should apply user reasoning config', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const userConfig: UserConfig = {
			global: {
				reasoningEffort: 'high',
				reasoningSummary: 'detailed',
			},
			models: {},
		};
		const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

		expect(result.reasoning?.effort).toBe('high');
		expect(result.reasoning?.summary).toBe('detailed');
	});

	it('should apply default text verbosity', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const result = await runTransform(body, codexInstructions);
		expect(result.text?.verbosity).toBe('medium');
	});

	it('should apply user text verbosity', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const userConfig: UserConfig = {
			global: { textVerbosity: 'low' },
			models: {},
		};
		const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });
		expect(result.text?.verbosity).toBe('low');
	});

	it('should set default include for encrypted reasoning', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const result = await runTransform(body, codexInstructions);
		expect(result.include).toEqual(['reasoning.encrypted_content']);
	});

	it('should use user-configured include', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const userConfig: UserConfig = {
			global: { include: ['custom_field', 'reasoning.encrypted_content'] },
			models: {},
		};
		const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });
		expect(result.include).toEqual(['custom_field', 'reasoning.encrypted_content']);
	});

	it('should remove IDs from input array (keep all items, strip IDs)', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [
				{ id: 'rs_123', type: 'message', role: 'assistant', content: 'old' },
				{ type: 'message', role: 'user', content: 'new' },
			],
		};
		const result = await runTransform(body, codexInstructions);

		// All items kept, IDs removed
		expect(result.input).toHaveLength(2);
		expect(result.input![0]).not.toHaveProperty('id');
		expect(result.input![1]).not.toHaveProperty('id');
		expect(result.input![0].content).toBe('old');
		expect(result.input![1].content).toBe('new');
	});

	it('should preserve IDs when preserveIds option is set', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [
				{ id: 'msg_1', type: 'message', role: 'user', content: 'hello' },
				{ id: 'call_1', type: 'function_call', role: 'assistant' },
			],
		};
		const result = await runTransform(body, codexInstructions, undefined, true, { preserveIds: true });

		expect(result.input).toHaveLength(2);
		expect(result.input?.[0].id).toBe('msg_1');
		expect(result.input?.[1].id).toBe('call_1');
	});

	it('should prioritize snake_case cache key when both fields present', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [{ type: 'message', role: 'user', content: 'hello' }],
			promptCacheKey: 'camelcase-key',
			prompt_cache_key: 'snakecase-key',
		};
		const result = await runTransform(body, codexInstructions);

		// Should prioritize snake_case over camelCase
		expect(result.prompt_cache_key).toBe('snakecase-key');
	});

	it('should add tool remap message when tools present', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [{ type: 'message', role: 'user', content: 'hello' }],
			tools: [{ name: 'test_tool' }],
		};
		const result = await runTransform(body, codexInstructions);
		expect(result.input![0].role).toBe('developer');
	});

	it('should not add tool remap message when tools absent', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [{ type: 'message', role: 'user', content: 'hello' }],
		};
		const result = await runTransform(body, codexInstructions);
		expect(result.input![0].role).toBe('user');
	});

	it('should remove unsupported parameters', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
			max_output_tokens: 1000,
			max_completion_tokens: 2000,
		};
		const result = await runTransform(body, codexInstructions);
		expect(result.max_output_tokens).toBeUndefined();
		expect(result.max_completion_tokens).toBeUndefined();
	});

	it('should normalize minimal to low for gpt-5-codex', async () => {
		const body: RequestBody = {
			model: 'gpt-5-codex',
			input: [],
		};
		const userConfig: UserConfig = {
			global: { reasoningEffort: 'minimal' },
			models: {},
		};
		const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });
		expect(result.reasoning?.effort).toBe('low');
	});

	it('should preserve minimal for non-codex models', async () => {
		const body: RequestBody = {
			model: 'gpt-5',
			input: [],
		};
		const userConfig: UserConfig = {
			global: { reasoningEffort: 'minimal' },
			models: {},
		};
		const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });
		expect(result.reasoning?.effort).toBe('minimal');
	});

	it('should use minimal effort for lightweight models', async () => {
		const body: RequestBody = {
			model: 'gpt-5-nano',
			input: [],
		};
		const result = await runTransform(body, codexInstructions);
		expect(result.reasoning?.effort).toBe('minimal');
	});

	describe('CODEX_MODE parameter', () => {
		it('should use bridge message when codexMode=true and tools present (default)', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'hello' }],
				tools: [{ name: 'test_tool' }],
			};
			const result = await runTransform(body, codexInstructions, undefined, true);

			expect(result.input).toHaveLength(2);
			expect(result.input![0].role).toBe('developer');
			expect((result.input![0].content as any)[0].text).toContain('Codex in OpenCode');
		});

		it('should filter OpenCode prompts when codexMode=true', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{
						type: 'message',
						role: 'developer',
						content: 'You are a coding agent running in OpenCode',
					},
					{ type: 'message', role: 'user', content: 'hello' },
				],
				tools: [{ name: 'test_tool' }],
			};
			const result = await runTransform(body, codexInstructions, undefined, true);

			// Should have bridge message + user message (OpenCode prompt filtered out)
			expect(result.input).toHaveLength(2);
			expect(result.input![0].role).toBe('developer');
			expect((result.input![0].content as any)[0].text).toContain('Codex in OpenCode');
			expect(result.input![1].role).toBe('user');
		});

		it('should not add bridge message when codexMode=true but no tools', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'hello' }],
			};
			const result = await runTransform(body, codexInstructions, undefined, true);

			expect(result.input).toHaveLength(1);
			expect(result.input![0].role).toBe('user');
		});

		it('should use tool remap message when codexMode=false', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'hello' }],
				tools: [{ name: 'test_tool' }],
			};
			const result = await runTransform(body, codexInstructions, undefined, false);

			expect(result.input).toHaveLength(2);
			expect(result.input![0].role).toBe('developer');
			expect((result.input![0].content as any)[0].text).toContain('apply_patch');
		});

		it('should not filter OpenCode prompts when codexMode=false', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{
						type: 'message',
						role: 'developer',
						content: 'You are a coding agent running in OpenCode',
					},
					{ type: 'message', role: 'user', content: 'hello' },
				],
				tools: [{ name: 'test_tool' }],
			};
			const result = await runTransform(body, codexInstructions, undefined, false);

			// Should have tool remap + opencode prompt + user message
			expect(result.input).toHaveLength(3);
			expect(result.input![0].role).toBe('developer');
			expect((result.input![0].content as any)[0].text).toContain('apply_patch');
			expect(result.input![1].role).toBe('developer');
			expect(result.input![2].role).toBe('user');
		});

		it('should default to codexMode=true when parameter not provided', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'hello' }],
				tools: [{ name: 'test_tool' }],
			};
			// Not passing codexMode parameter - should default to true
			const result = await runTransform(body, codexInstructions);

			// Should use bridge message (codexMode=true by default)
			expect(result.input![0].role).toBe('developer');
			expect((result.input![0].content as any)[0].text).toContain('Codex in OpenCode');
		});
	});

	// NEW: Integration tests for all config scenarios
	describe('Integration: Complete Config Scenarios', () => {
		describe('Scenario 1: Default models (no custom config)', () => {
			it('should handle gpt-5-codex with global options only', async () => {
				const body: RequestBody = {
					model: 'gpt-5-codex',
					input: []
				};
				const userConfig: UserConfig = {
					global: { reasoningEffort: 'high' },
					models: {}
				};

				const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

				expect(result.model).toBe('gpt-5-codex');  // Not changed
				expect(result.reasoning?.effort).toBe('high');  // From global
				expect(result.store).toBe(false);
			});

			it('should handle gpt-5-mini normalizing to gpt-5', async () => {
				const body: RequestBody = {
					model: 'gpt-5-mini',
					input: []
				};

				const result = await runTransform(body, codexInstructions);

				expect(result.model).toBe('gpt-5');  // Normalized
				expect(result.reasoning?.effort).toBe('minimal');  // Lightweight default
			});
		});

		describe('Scenario 2: Custom preset names (new style)', () => {
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'medium', include: ['reasoning.encrypted_content'] },
				models: {
					'gpt-5-codex-low': {
						options: { reasoningEffort: 'low' }
					},
					'gpt-5-codex-high': {
						options: { reasoningEffort: 'high', reasoningSummary: 'detailed' }
					}
				}
			};

			it('should apply per-model options for gpt-5-codex-low', async () => {
				const body: RequestBody = {
					model: 'gpt-5-codex-low',
					input: []
				};

				const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

				expect(result.model).toBe('gpt-5-codex');  // Normalized
				expect(result.reasoning?.effort).toBe('low');  // From per-model
				expect(result.include).toEqual(['reasoning.encrypted_content']);  // From global
			});

			it('should apply per-model options for gpt-5-codex-high', async () => {
				const body: RequestBody = {
					model: 'gpt-5-codex-high',
					input: []
				};

				const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

				expect(result.model).toBe('gpt-5-codex');  // Normalized
				expect(result.reasoning?.effort).toBe('high');  // From per-model
				expect(result.reasoning?.summary).toBe('detailed');  // From per-model
			});

			it('should use global options for default gpt-5-codex', async () => {
				const body: RequestBody = {
					model: 'gpt-5-codex',
					input: []
				};

				const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

				expect(result.model).toBe('gpt-5-codex');  // Not changed
				expect(result.reasoning?.effort).toBe('medium');  // From global (no per-model)
			});
		});

		describe('Scenario 3: Backwards compatibility (old verbose names)', () => {
			const userConfig: UserConfig = {
				global: {},
				models: {
					'GPT 5 Codex Low (ChatGPT Subscription)': {
						options: { reasoningEffort: 'low', textVerbosity: 'low' }
					}
				}
			};

			it('should find and apply old config format', async () => {
				const body: RequestBody = {
					model: 'GPT 5 Codex Low (ChatGPT Subscription)',
					input: []
				};

				const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

				expect(result.model).toBe('gpt-5-codex');  // Normalized
				expect(result.reasoning?.effort).toBe('low');  // From per-model (old format)
				expect(result.text?.verbosity).toBe('low');
			});
		});

		describe('Scenario 4: Mixed default + custom models', () => {
			const userConfig: UserConfig = {
				global: { reasoningEffort: 'medium' },
				models: {
					'gpt-5-codex-low': {
						options: { reasoningEffort: 'low' }
					}
				}
			};

			it('should use per-model for custom variant', async () => {
				const body: RequestBody = {
					model: 'gpt-5-codex-low',
					input: []
				};

				const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

				expect(result.reasoning?.effort).toBe('low');  // Per-model
			});

			it('should use global for default model', async () => {
				const body: RequestBody = {
					model: 'gpt-5',
					input: []
				};

				const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

				expect(result.reasoning?.effort).toBe('medium');  // Global
			});
		});

		describe('Scenario 5: Message ID filtering with multi-turn', () => {
			it('should remove ALL IDs in multi-turn conversation', async () => {
				const body: RequestBody = {
					model: 'gpt-5-codex',
					input: [
						{ id: 'msg_turn1', type: 'message', role: 'user', content: 'first' },
						{ id: 'rs_response1', type: 'message', role: 'assistant', content: 'response' },
						{ id: 'msg_turn2', type: 'message', role: 'user', content: 'second' },
						{ id: 'assistant_123', type: 'message', role: 'assistant', content: 'reply' },
					]
				};

				const result = await runTransform(body, codexInstructions);

				// All items kept, ALL IDs removed
				expect(result.input).toHaveLength(4);
				expect(result.input!.every(item => !item.id)).toBe(true);
				expect(result.store).toBe(false);  // Stateless mode
				expect(result.include).toEqual(['reasoning.encrypted_content']);
			});
		});

		describe('Scenario 6: Complete end-to-end transformation', () => {
			it('should handle full transformation: custom model + IDs + tools', async () => {
				const userConfig: UserConfig = {
					global: { include: ['reasoning.encrypted_content'] },
					models: {
						'gpt-5-codex-low': {
							options: {
								reasoningEffort: 'low',
								textVerbosity: 'low',
								reasoningSummary: 'auto'
							}
						}
					}
				};

				const body: RequestBody = {
					model: 'gpt-5-codex-low',
					input: [
						{ id: 'msg_1', type: 'message', role: 'user', content: 'test' },
						{ id: 'rs_2', type: 'message', role: 'assistant', content: 'reply' }
					],
					tools: [{ name: 'edit' }]
				};

				const result = await runTransform(body, codexInstructions, userConfig, true, { preserveIds: false });

				// Model normalized
				expect(result.model).toBe('gpt-5-codex');

				// IDs removed
				expect(result.input!.every(item => !item.id)).toBe(true);

				// Per-model options applied
				expect(result.reasoning?.effort).toBe('low');
				expect(result.reasoning?.summary).toBe('auto');
				expect(result.text?.verbosity).toBe('low');

				// Codex fields set
				expect(result.store).toBe(false);
				expect(result.stream).toBe(true);
				expect(result.instructions).toBe(codexInstructions);
				expect(result.include).toEqual(['reasoning.encrypted_content']);
			});
		});
	});

	describe('Edge Cases and Error Handling', () => {
		it('should handle empty input array', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.input).toEqual([]);
		});

		it('should handle null input', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: null as any,
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.input).toBeNull();
		});

		it('should handle undefined input', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: undefined as any,
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.input).toBeUndefined();
		});

		it.skip('should handle malformed input items', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					null,
					undefined,
					{ type: 'message', role: 'user' }, // missing content
					{ not: 'a valid item' } as any,
				],
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.input).toHaveLength(4);
		});

		it('should handle content array with mixed types', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{
						type: 'message',
						role: 'user',
						content: [
							{ type: 'input_text', text: 'text content' },
							{ type: 'image', image_url: 'url' },
							null,
							undefined,
							'not an object',
						],
					},
				],
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.input).toHaveLength(1);
			expect(Array.isArray(result.input![0].content)).toBe(true);
		});

		it('should handle very long model names', async () => {
			const body: RequestBody = {
				model: 'very-long-model-name-with-gpt-5-codex-and-extra-stuff',
				input: [],
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.model).toBe('gpt-5-codex');
		});

		it('should handle model with special characters', async () => {
			const body: RequestBody = {
				model: 'gpt-5-codex@v1.0#beta',
				input: [],
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.model).toBe('gpt-5-codex');
		});

	it('should handle empty string model', async () => {
		const body: RequestBody = {
			model: '',
			input: [],
		};
		const result = await runTransform(body, codexInstructions);
		expect(result.model).toBe('gpt-5.1');
	});


		it('should handle reasoning config edge cases', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
				reasoning: {
					effort: 'invalid' as any,
					summary: null as any,
				} as any,
			};
			const result = await runTransform(body, codexInstructions);
			// Should override with defaults
			expect(result.reasoning?.effort).toBe('medium');
			expect(result.reasoning?.summary).toBe('auto');
		});

		it('should handle text config edge cases', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
				text: {
					verbosity: 'invalid' as any,
				} as any,
			};
			const result = await runTransform(body, codexInstructions);
			// Should override with defaults
			expect(result.text?.verbosity).toBe('medium');
		});

		it('should handle include field edge cases', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
				include: ['invalid', 'field', null as any, undefined as any],
			};
			const result = await runTransform(body, codexInstructions);
			// Should override with defaults
			expect(result.include).toEqual(['reasoning.encrypted_content']);
		});

		it.skip('should handle session manager edge cases', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'test' }],
			};
			
			const mockSessionManager = {
				getContext: () => null,
				applyRequest: () => null,
			} as any;

			const result = await runTransform(
				body, 
				codexInstructions, 
				undefined, 
				true, 
				{ preserveIds: false }, 
				mockSessionManager
			);
			
			expect(result).toBeDefined();
			expect(result.input).toHaveLength(1);
		});

		it('should handle tools array edge cases', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'test' }],
				tools: [
					null,
					undefined,
					{ name: 'valid_tool' },
					'not an object' as any,
				],
			};
			const result = await runTransform(body, codexInstructions);
			// Should still add bridge message since tools array exists
			expect(result.input).toHaveLength(2);
			expect(result.input![0].role).toBe('developer');
		});

		it('should handle empty tools array', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [{ type: 'message', role: 'user', content: 'test' }],
				tools: [],
			};
			const result = await runTransform(body, codexInstructions);
			// Should not add bridge message for empty tools array
			expect(result.input).toHaveLength(1);
			expect(result.input![0].role).toBe('user');
		});

		it('should handle metadata edge cases', async () => {
			const body: RequestBody = {
				model: 'gpt-5',
				input: [],
			metadata: {
				conversation_id: null,
				extra: 'field',
				nested: { id: 'value' },
			},
		};
		const result1 = await runTransform(body, codexInstructions);
		const firstKey = result1.prompt_cache_key;
		// Should generate fallback cache key
		expect(typeof firstKey).toBe('string');
		expect(firstKey).toMatch(/^cache_/);

		// Second transform of the same body should reuse the existing key
		const result2 = await runTransform(body, codexInstructions);
		expect(result2.prompt_cache_key).toBe(firstKey);
	});


		it('should handle very long content', async () => {
			const longContent = 'a'.repeat(10000);
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{ type: 'message', role: 'user', content: longContent },
				],
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.input![0].content).toBe(longContent);
		});

		it('should handle unicode content', async () => {
			const unicodeContent = 'Hello 世界 🚀 emoji test';
			const body: RequestBody = {
				model: 'gpt-5',
				input: [
					{ type: 'message', role: 'user', content: unicodeContent },
				],
			};
			const result = await runTransform(body, codexInstructions);
			expect(result.input![0].content).toBe(unicodeContent);
		});
	});
});