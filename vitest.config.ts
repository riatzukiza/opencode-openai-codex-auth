import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const gitignorePath = resolve(__dirname, '.gitignore');
const gitignoreCoverageExcludes = (() => {
  try {
    return readFileSync(gitignorePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'))
      .map((entry) => {
        const normalized = entry.replace(/^\/+/, '').replace(/\/+$/, '');
        if (!normalized) {
          return undefined;
        }
        if (entry.endsWith('/')) {
          return `**/${normalized}/**`;
        }
        return `**/${normalized}`;
      })
      .filter((pattern): pattern is string => pattern !== undefined);
  } catch {
    return [];
  }
})();

const coverageExcludes = Array.from(
  new Set([
    'node_modules/',
    'dist/',
    'test/',
    '**/test/**',
    '**/*.test.ts',
    '.stryker-tmp/**',
    '**/*.d.ts',
    'coverage/**',
    'scripts/**',
    ...gitignoreCoverageExcludes,
  ]),
);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      '.opencode/**',
      'dist/**',
      'tmp/**',
      '**/node_modules/**',
      '**/.opencode/**',
      '**/dist/**',
      '**/tmp/**',
    ],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: coverageExcludes,
    },
  },
});
