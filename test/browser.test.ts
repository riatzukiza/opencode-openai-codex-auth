import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getBrowserOpener, openBrowserUrl } from '../lib/auth/browser.js';
import { PLATFORM_OPENERS } from '../lib/constants.js';

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
	__esModule: true,
	spawn: spawnMock,
}));

describe('Browser Module', () => {
	describe('getBrowserOpener', () => {
		it('should return correct opener for darwin', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'darwin' });
			expect(getBrowserOpener()).toBe(PLATFORM_OPENERS.darwin);
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should return correct opener for win32', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'win32' });
			expect(getBrowserOpener()).toBe(PLATFORM_OPENERS.win32);
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should return linux opener for other platforms', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'linux' });
			expect(getBrowserOpener()).toBe(PLATFORM_OPENERS.linux);
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('should handle unknown platforms', () => {
			const originalPlatform = process.platform;
			Object.defineProperty(process, 'platform', { value: 'freebsd' });
			expect(getBrowserOpener()).toBe(PLATFORM_OPENERS.linux);
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});
	});

	describe('openBrowserUrl', () => {
		let originalPlatform: NodeJS.Platform;

		beforeEach(() => {
			originalPlatform = process.platform;
			spawnMock.mockReset();
			Object.defineProperty(process, 'platform', { value: 'linux' });
		});

		afterEach(() => {
			Object.defineProperty(process, 'platform', { value: originalPlatform });
		});

		it('spawns platform opener with provided URL', () => {
			openBrowserUrl('https://example.com');
			expect(spawnMock).toHaveBeenCalledWith('xdg-open', ['https://example.com'], {
				stdio: 'ignore',
				shell: false,
			});
		});

		it('swallows spawn errors to avoid crashing', () => {
			spawnMock.mockImplementation(() => {
				throw new Error('spawn failed');
			});
			expect(() => openBrowserUrl('https://example.com')).not.toThrow();
		});
	});
});
