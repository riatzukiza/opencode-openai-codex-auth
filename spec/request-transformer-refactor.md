# Request Transformer Refactor

## Context

- `lib/request/request-transformer.ts` is 1,094 lines (eslint `max-lines` warning; target <500).
- Build failure: missing `normalizeToolsForResponses` reference (available in `lib/request/tool-normalizer.ts` line 139).
- Lint warning: `.eslintignore` deprecation message (out of scope for this task unless affected file changes).

## Relevant Code References

- `lib/request/request-transformer.ts` lines 1-1094: monolithic helpers for model normalization, reasoning config, input filtering, bridge/tool messages, prompt cache keys, and `transformRequestBody` entrypoint.
- `lib/request/tool-normalizer.ts` lines 1-158: provides `normalizeToolsForResponses` used by transformer but not imported.
- Tests mirror structure under `test/` (e.g., `test/request-transformer.test.ts`).

## Definition of Done

- `lib/request/request-transformer.ts` reduced below 500 lines while preserving behavior and exports.
- Missing `normalizeToolsForResponses` import resolved; TypeScript build passes.
- ESLint passes without new warnings/errors (existing `.eslintignore` warning acceptable if unchanged).
- Existing tests relevant to transformed logic updated if needed and passing locally (at least lint/build executed).

## Plan (Phases)

### Phase 1: Extraction Design

- Identify logical groupings (model/reasoning config, input filtering/bridge, prompt cache key utilities, tool normalization usage, main transform orchestration).
- Decide target helper modules under `lib/request/` to move into (e.g., `model-config.ts`, `input-filters.ts`, `prompt-cache.ts`).

### Phase 2: Implement Refactors

- Create/adjust helper modules and move functions accordingly; export/import from transformer.
- Wire missing `normalizeToolsForResponses` import from `tool-normalizer.ts`.
- Keep `transformRequestBody` orchestrator lean by reusing helpers; ensure type/shared constants remain.

### Phase 3: Validation

- Run `pnpm lint` and `pnpm build` to confirm lint/TypeScript success.
- Update todos/spec with outcomes and note any follow-ups.

## Notes

- Preserve existing behavior (stateless filtering, bridge prompt caching, prompt cache key derivation).
- Avoid altering public APIs consumed by tests unless necessary; adjust tests if import paths change.

## Change Log

- Split `lib/request/request-transformer.ts` into helper modules (`model-config.ts`, `input-filters.ts`, `prompt-cache.ts`, `tooling.ts`) and re-exported APIs to keep the transformer under 500 lines.
- Added missing `normalizeToolsForResponses` import via `normalizeToolsForCodexBody` helper.
- Ran `pnpm build` and `pnpm lint` (lint only warning remains about legacy `.eslintignore`).
