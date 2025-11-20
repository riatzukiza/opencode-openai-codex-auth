# Mutation Score Improvement Plan

## Context
- Latest `pnpm test:mutation` run fails because overall mutation score is **56.44%**, below the configured breaking threshold of 60.
- Survivors are concentrated in `index.ts` (mutation score 35%) and `lib/request/request-transformer.ts` (40%). Raising coverage in `index.ts` is the fastest path to clearing the threshold because it contains numerous easy-to-test control paths that are currently unverified.

## Existing Work
- Open issues: #36 `[BUG] Codex-mini doesn't work` (unrelated to mutation score).
- Open PRs: #37 `feat: Normalize Codex Mini naming to gpt-5-codex-mini` (unrelated).
- No active effort on mutation testing, so we can proceed without conflicts.

## Targeted Files & Lines
1. `index.ts:81-92` — `isCodexResponsePayload` type guard lacks coverage; all mutants within the guard survive because no tests exercise valid vs invalid payload scenarios after a fetch.
2. `index.ts:117-125` — User configuration merging (`providerConfig?.options || {}`) never asserted in tests; optional chaining and fallback behavior survive mutations.
3. `index.ts:205-224` — Session-context handling branches (recording Codex responses, logging parse failures) are currently skipped in `test/index.test.ts`, so Stryker marks those mutants as untested/survivors.
4. `test/index.test.ts` — Contains two skipped cases (`handles session manager response recording`, `handles malformed response payload`) which, if fixed and expanded, can directly kill many mutants.

## Phased Plan
### Phase 1 – Reinstate & expand session recording tests
- Unskip and stabilize the existing session-manager recording test by providing deterministic mocks for `fetch`, `handleSuccessResponse`, and session context.
- Add explicit assertions for `sessionManager.recordResponse` to ensure `isCodexResponsePayload` sees a valid payload (kills mutants around lines 81-90).
- Add a complementary test for malformed payload (non-object / wrong `usage`) to ensure `recordResponse` is *not* invoked and debug logging occurs.

### Phase 2 – Cover provider config merging and prompt caching flags
- Add unit tests that call `plugin.auth.loader` with:
  - No provider overrides (expect `{}` for both `global` and `models`).
  - Custom `options` and `models` (ensure the same objects reach `transformRequestForCodex`).
- These expectations will kill the survivors around lines 117-125 where fallback logic currently goes unverified.

### Phase 3 – Spot-check request transformation surfaces (time permitting)
- If the score still lags, add a focused test in `test/request-transformer.test.ts` hitting an uncovered branch (e.g., metadata edge cases) to shave off additional survivors.

### Phase 4 – Split loader orchestration into reusable helpers
- Move the 7-step fetch pipeline out of `index.ts` into a dedicated module (e.g., `lib/request/codex-fetcher.ts`).
- Keep `OpenAIAuthPlugin` responsible only for config derivation and dependency wiring; delegate all network work to the helper.
- Add a focused test suite for the new helper to exercise token refresh, command short-circuiting, session recording, and error handling branches directly.
- Update existing plugin tests to stub the helper rather than re-mocking every fetch dependency; this reduces duplication and lets Stryker see coverage inside the helper itself.

## Definition of Done
- `pnpm test` and `pnpm test:mutation` both pass locally.
- Overall mutation score ≥ 60 (ideally closer to 65 to provide buffer).
- Newly added tests are deterministic (no skipped cases) and clearly document the behavior they protect.

## Requirements & Considerations
- Keep new tests focused on existing behavior—no product changes desired.
- Maintain ASCII-only text in tests; prefer `vi.mock` and `vi.hoisted` patterns already used in `test/index.test.ts`.
- Ensure mocks reset between tests to avoid cross-test interference, as `vitest` currently uses hoisted mocks throughout this suite.

## 2025-11-13 Update

- Latest `pnpm test:mutation` run reports an overall mutation score of **63.69%** (threshold remains 60).
- `index.ts` has been improved to ~90% mutation score; remaining gaps are concentrated in:
  - `lib/request/request-transformer.ts` (~52.32%; 462 killed / 260 survived / 161 no-cov).
  - `lib/prompts/codex.ts` (~61.74%; 71 killed / 39 survived / 5 no-cov).
  - `lib/constants.ts` (25%; 1 killed / 3 survived).
- For this iteration we implemented:
  - Stronger `lib/prompts/codex.ts` tests around cache layering (in-memory session cache, on-disk cache, 304 responses, and bundled fallback).
  - Focused assertions for `lib/constants.ts` to ensure key HTTP status codes, header names/values, URL paths, and OAuth labels are pinned by tests.
  - Additional `transformRequestBody` tests that exercise Codex tool normalization for string tools, function-style tools, and map-based tool configurations.
- Definition of done for this pass:
  - Overall mutation score ≥ 60 with a comfortable buffer (current score **63.69%**).
  - No new flaky or slow tests introduced.


## 2025-11-19 Update

- Latest `pnpm test:mutation` run fails with mutation score **57.26%** (threshold 60). Survivors cluster in `lib/request/request-transformer.ts` (341 survived / 171 no-cov), `lib/utils/input-item-utils.ts` (mutation score ~21%; 7 survived / 56 no-cov), and `lib/commands/codex-metrics.ts` (mutation score ~43%; 94 survived / 79 no-cov) where the inspect command path is untested.
- No new relevant issues or PRs identified beyond previously noted #36 and #37.
- Target files & lines for this pass:
  - `lib/utils/input-item-utils.ts:16-125` — text extraction, role formatting, and conversation helpers lack direct tests.
  - `lib/utils/clone.ts:13-44` — structuredClone branch vs JSON fallback and array cloning guards.
  - `lib/commands/codex-metrics.ts:36-215,263-414` — inspect command handling, trigger normalization, and SSE payload formatting currently uncovered.
- Definition of done:
  - Add deterministic tests covering input-item helpers (string vs array content, role validation, turn counting), clone utilities (primitive passthrough, structuredClone usage, empty-array guard), and inspect command responses (trigger variants, include metadata, fallback model).
  - Achieve mutation score ≥ 60 and ensure `pnpm test` passes.
- Requirements & considerations:
  - Keep new tests fast and deterministic (reuse mocks for cache warm snapshot, avoid network/disk writes).
  - Preserve existing behavior; focus on pinning current outputs and newline/formatting semantics during assertions.
