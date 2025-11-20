# Lint cleanup plan

## Scope

- Fix ESLint error `sonarjs/cognitive-complexity` in `lib/request/request-transformer.ts` (`transformRequestBody`, ~line 966).
- Reduce warning count focusing on quick wins: unused vars, arrow-body-style, and no-param-reassign in small helper files.

## Files/lines

- `lib/request/request-transformer.ts`: `transformRequestBody` (~966), assignments in TOOL config setters (~987-1131).
- `lib/auth/server.ts`: mutation of `res` (~22-42).
- `lib/auth/browser.ts`: unused `_error` (~32).
- `lib/cache/session-cache.ts`: arrow-body-style (~68).
- `lib/request/fetch-helpers.ts`: unused `InputItem` (~20), no-param-reassign (~70-72), complexity warnings in helpers (~107, 253).
- `lib/prompts/opencode-codex.ts`: unused `cacheDir` arg (~33), long functions (~94).
- `test/request-transformer.test.ts`: file length warning (not tackling now unless needed).

## Existing issues / PRs

- None reviewed/linked in this session.

## Definition of done

- `pnpm lint` completes with zero errors.
- Warning count reduced meaningfully from current 96 (target: remove easy ones touched above).
- Runtime behavior unchanged; tests expected to still pass.

## Requirements

- Preserve plugin behavior and request/response flows.
- Keep edits minimal and focused; add comments only if necessary.
- Avoid disabling rules globally; use targeted refactors or narrow disables if needed.
