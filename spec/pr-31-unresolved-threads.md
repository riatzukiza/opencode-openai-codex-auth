# PR #31 unresolved review threads (investigation)

## Scope

- Repository: open-hax/codex
- PR: https://github.com/open-hax/codex/pull/31
- Goal: catalog all unresolved threads and state what remains to address.

## Unresolved threads and current state

1. `lib/request/fetch-helpers.ts` lines ~40-78 (`refreshAndUpdateToken`)
   - Comment: tests still expect in-place auth mutation; update to assert on returned `result.auth`.
   - Finding: test already asserted `result.auth.*`; no code change needed. Thread can be resolved (see test/fetch-helpers.test.ts:238-244).
   - Action: note on PR that tests now check returned auth; mark resolved.

2. `lib/request/fetch-helpers.ts` lines ~68-76 (`refreshAndUpdateToken`)
   - Comment: avoid mutating `currentAuth` (lint warnings: assignment to parameter); build new auth object instead.
   - Finding: refactored to return a cloned auth object without mutating the parameter (lint warning addressed).
   - Action: mention refactor on PR; thread resolved by code change.

3. `lib/logger.ts` lines ~10-13
   - Comment: `SKIP_IO` unused, breaks lint; not gating test-time I/O.
   - Finding: removed unused constant; lint warning cleared.
   - Action: call out removal on PR; thread resolved.

4. `lib/logger.ts` lines ~171-173 (`logToConsole` gating)
   - Comment: info logs now always print outside tests regardless of debug flag; should gate debug/info behind `DEBUG_CODEX_PLUGIN` unless intentional.
   - Finding: gating tightened — debug/info now emit only when `DEBUG_CODEX_PLUGIN` is set (still always log warn/error).
   - Action: confirm intent on PR; thread resolved.

5. `test/fetch-helpers.test.ts` lines ~321-323
   - Comment: clarify comment about updatedInit serialization scope.
   - Finding: comment reworded to reference `transformResult.body`; ambiguity removed.
   - Action: note clarification; thread resolved.

## Existing issues / PRs

- Existing PR: #31 (current). No separate tracking issues referenced.

## Definition of done

- Every open thread above is resolved or answered on the PR with justification.
- Lint/tests pass after any code/test updates made to address threads.
- PR reflects final intent (logging gating clarified; auth refresh lint resolved; doc comment clarified).

## Requirements / notes

- Align responses with current code state (tests already updated for thread 1).
- Be explicit when behavior is intentional (e.g., logging policy) if choosing not to change code.
- If code changes: update tests as needed to keep CI green and avoid parameter mutation lint warnings.
