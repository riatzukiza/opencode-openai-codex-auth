import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { codexInstructionsCache, getCodexCacheKey } from '../lib/cache/session-cache.js';

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
			'[openai-codex-plugin] Failed to fetch instructions from GitHub {"error":"HTTP 500"}',
			'',
		);
		expect(consoleError).toHaveBeenCalledWith('[openai-codex-plugin] Using cached instructions due to fetch failure', '');
		consoleError.mockRestore();
	});

	it('serves in-memory session cache when latest entry exists', async () => {
		codexInstructionsCache.set('latest', {
			data: 'session-cached',
			etag: '"etag-latest"',
			tag: 'v-latest',
		});

		const { getCodexInstructions } = await import('../lib/prompts/codex.js');
		const result = await getCodexInstructions();

		expect(result).toBe('session-cached');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('reuses session cache based on metadata cache key', async () => {
		const metadata = {
			etag: '"meta-etag"',
			tag: 'v1',
			lastChecked: Date.now() - 10 * 60 * 1000,
		};
		files.set(cacheMeta, JSON.stringify(metadata));

		const cacheKey = getCodexCacheKey(metadata.etag, metadata.tag);
		codexInstructionsCache.set(cacheKey, {
			data: 'session-meta',
			etag: metadata.etag,
			tag: metadata.tag,
		});

		const { getCodexInstructions } = await import('../lib/prompts/codex.js');
		const result = await getCodexInstructions();

		expect(result).toBe('session-meta');
		expect(fetchMock).not.toHaveBeenCalled();

		const latestEntry = codexInstructionsCache.get('latest');
		expect(latestEntry?.data).toBe('session-meta');
	});

	it('uses file cache when GitHub responds 304 Not Modified', async () => {
		files.set(cacheFile, 'from-file-304');
		files.set(
			cacheMeta,
			JSON.stringify({
				etag: '"etag-304"',
				tag: 'v1',
				lastChecked: Date.now() - 20 * 60 * 1000,
			}),
		);

		const notModifiedResponse = {
			status: 304,
			ok: false,
			headers: {
				get: (name: string) => {
					if (name.toLowerCase() === 'etag') return '"etag-304"';
					return null;
				},
			},
		} as any;

		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ tag_name: 'v1' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			)
			.mockResolvedValueOnce(notModifiedResponse);

		const { getCodexInstructions } = await import('../lib/prompts/codex.js');
		const result = await getCodexInstructions();

		expect(result).toBe('from-file-304');
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const latestEntry = codexInstructionsCache.get('latest');
		expect(latestEntry?.data).toBe('from-file-304');
	});

	it('falls back to bundled instructions when no cache is available', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		fetchMock
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ tag_name: 'v1' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			)
			.mockResolvedValueOnce(new Response('', { status: 500 }));

		const { getCodexInstructions } = await import('../lib/prompts/codex.js');
		const result = await getCodexInstructions();

		expect(typeof result).toBe('string');
		expect(consoleError).toHaveBeenCalledWith(
			'[openai-codex-plugin] Failed to fetch instructions from GitHub {"error":"HTTP 500"}',
			'',
		);
		expect(consoleError).toHaveBeenCalledWith(
			'[openai-codex-plugin] Falling back to bundled instructions',
			'',
		);

		const readPaths = readFileSync.mock.calls.map((call) => call[0] as string);
		const fallbackPath = readPaths.find(
			(path) => path.endsWith('codex-instructions.md') && !path.startsWith(cacheDir),
		);
		expect(fallbackPath).toBeDefined();

		const latestEntry = codexInstructionsCache.get('latest');
		expect(latestEntry).not.toBeNull();

		consoleError.mockRestore();
	});
});
