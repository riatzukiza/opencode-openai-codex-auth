# Fix hanging server tests due to `node:fs` mock

## Context

- `test/server.test.ts:57-64` fully mocks `node:fs` with only `readFileSync`. All other exports (e.g., `existsSync`) are missing.
- When `lib/auth/server.ts` (and its transitive dependency `lib/logger.ts`) initialize, they indirectly reference helpers in `lib/utils/file-system-utils.ts` that call `fs.existsSync`.
- Vitest throws `[vitest] No "existsSync" export is defined on the "node:fs" mock...` repeatedly, which also triggers our logging retry loop, causing the hang.

## Existing issues / PRs

- No open issues or PRs in this repo mention the `existsSync` mock failure (searched locally on 2025-11-19).

## Requirements / Definition of Done

1. Server test suite must finish without the repetitive vitest mock error or rolling-log warnings.
2. `node:fs` should be partially mocked so other exports (e.g., `existsSync`, `promises`) remain available while we stub `readFileSync`.
3. Tests that rely on the HTML fixture should still receive the fake HTML payload.
4. Relevant Vitest suites (`test/server.test.ts`) pass locally; broader suites if quick.

## Plan

### Phase 1: Update mock implementation

- Expand the `node:fs` mock used in `test/server.test.ts` so it provides every synchronous helper that downstream code imports (`readFileSync`, `existsSync`, `mkdirSync`, `writeFileSync`).
- Keep the mock implementation lightweight (no real I/O) but retain `vi.fn` handles for assertions.
- Ensure both named exports and the `default` export expose the mocked helpers to satisfy `import fs from "node:fs"` and named imports.

### Phase 2: Verification

- Re-run the targeted server tests (or entire suite if fast) to ensure Vitest no longer logs the error and all tests complete.
- Confirm no new lint/type errors are introduced.

## Notes

- `MockResponse` previously lacked `writeHead`, which made every request throw; add a minimal implementation to keep the mock aligned with Node's `ServerResponse` API.
- Attempting to partially mock with `vi.importActual` caused Vitest to skip the `node:http` mock and spin up a real server, so we stick to an explicit mock object for stability.
- If future code paths rely on additional `fs` APIs we can extend the same mock object with more functions.
