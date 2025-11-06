import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { codexInstructionsCache } from '../lib/cache/session-cache.js';

const files = new Map<string, string>();
const existsSync = vi.fn((file: string) => files.has(file));
const readFileSync = vi.fn((file: string) => files.get(file) ?? '');
const writeFileSync = vi.fn((file: string, content: string) => files.set(file, content));
const mkdirSync = vi.fn();
const homedirMock = vi.fn(() => '/mock-home');
const fetchMock = vi.fn();

vi.mock('node:fs', () => ({
	default: {
		existsSync,
		readFileSync,
		writeFileSync,
		mkdirSync,
	},
	existsSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
}));

vi.mock('node:os', () => ({
	__esModule: true,
	homedir: homedirMock,
}));

describe('Codex Instructions Fetcher', () => {
	const cacheDir = join('/mock-home', '.opencode', 'cache');
	const cacheFile = join(cacheDir, 'codex-instructions.md');
	const cacheMeta = join(cacheDir, 'codex-instructions-meta.json');

beforeEach(() => {
		files.clear();
		existsSync.mockClear();
		readFileSync.mockClear();
		writeFileSync.mockClear();
		mkdirSync.mockClear();
		homedirMock.mockReturnValue('/mock-home');
		fetchMock.mockClear();
		global.fetch = fetchMock;
		codexInstructionsCache.clear();
	});

	afterEach(() => {
		// Cleanup global fetch if needed
		delete (global as any).fetch;
	});

	it('returns cached instructions when cache is fresh', async () => {
		files.set(cacheFile, 'cached-instructions');
		files.set(
			cacheMeta,
			JSON.stringify({
				etag: '"etag"',
				tag: 'v1',
				lastChecked: Date.now(),
			}),
		);

		const { getCodexInstructions } = await import('../lib/prompts/codex.js');
		const result = await getCodexInstructions();

		expect(result).toBe('cached-instructions');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('fetches latest instructions when cache is stale', async () => {
		files.set(cacheFile, 'old-cache');
		files.set(
			cacheMeta,
			JSON.stringify({
				etag: '"old-etag"',
				tag: 'v1',
				lastChecked: Date.now() - 16 * 60 * 1000,
			}),
		);

		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ tag_name: 'v2' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			)
			.mockResolvedValueOnce(
				new Response('fresh instructions', {
					status: 200,
					headers: { etag: '"new-etag"' },
				}),
			);

		const { getCodexInstructions } = await import('../lib/prompts/codex.js');
		const result = await getCodexInstructions();

		expect(result).toBe('fresh instructions');
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const meta = JSON.parse(files.get(cacheMeta) ?? '{}');
		expect(meta.tag).toBe('v2');
		expect(meta.etag).toBe('"new-etag"');
		expect(meta.url).toContain('codex-rs/core/gpt_5_codex_prompt.md');
		expect(files.get(cacheFile)).toBe('fresh instructions');
	});

	it('falls back to cached instructions when fetch fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		files.set(cacheFile, 'still-good');
		files.set(
			cacheMeta,
			JSON.stringify({
				etag: '"old-etag"',
				tag: 'v1',
				lastChecked: Date.now() - 20 * 60 * 1000,
			}),
		);

		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ tag_name: 'v2' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			)
			.mockResolvedValueOnce(new Response('', { status: 500 }));

		const { getCodexInstructions } = await import('../lib/prompts/codex.js');
		const result = await getCodexInstructions();

		expect(result).toBe('still-good');
		expect(consoleError).toHaveBeenCalledWith(
			'[openai-codex-plugin] Failed to fetch instructions from GitHub:',
			'HTTP 500',
		);
		expect(consoleError).toHaveBeenCalledWith('[openai-codex-plugin] Using cached instructions');
		consoleError.mockRestore();
	});
});
