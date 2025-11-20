# Complexity Reduction Plan

## Scope

- Reduce ESLint complexity warnings for:
  - `lib/prompts/codex.ts`: `getCodexInstructions` (lines ~49-165)
  - `lib/prompts/opencode-codex.ts`: `getOpenCodeCodexPrompt` (lines ~94-230)
  - `lib/request/fetch-helpers.ts`: `transformRequestForCodex` (lines ~111-210), `handleErrorResponse` (lines ~256-336)
  - `lib/request/request-transformer.ts`: tool normalization arrow (`convertTool`, lines ~138-188) and `getReasoningConfig` (lines ~291-359)

## Existing Issues / PRs

- None identified (no open issues/PRs reviewed for this specific task).

## Requirements

- Preserve current behavior, caching semantics, and logging side effects.
- Keep file paths and cache metadata formats stable.
- Maintain test expectations in existing spec files for prompts, fetch helpers, and request transformer.

## Definition of Done

- ESLint no longer reports complexity warnings for the listed functions.
- Relevant unit tests continue to pass (targeted suite for touched modules).
- No regressions in caching or request transformation behavior (based on tests/logical review).

## Plan (Phases)

1. **Prompt Fetchers**: Refactor `getCodexInstructions` and `getOpenCodeCodexPrompt` by extracting helper routines for cache reads/writes, freshness checks, and network fetch handling to reduce branching.
2. **Request Transformation**: Break down `transformRequestForCodex` and tool normalization into smaller helpers (e.g., compaction config, logging wrappers, tool converters) to simplify flow.
3. **Error/Reasoning Handling**: Simplify `handleErrorResponse` and `getReasoningConfig` with helper functions and clearer rule tables; ensure messaging and rate-limit parsing stay intact.
4. **Validation**: Run targeted lint/tests to confirm complexity warnings resolved and behavior intact.
