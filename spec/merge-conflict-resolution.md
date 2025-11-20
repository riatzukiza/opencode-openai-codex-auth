# Merge Conflict Resolution Plan (ops/release-workflow)

## Context
- Branch: `ops/release-workflow` with merge state and unmerged paths.
- Conflicted files (from `git diff --name-only --diff-filter=U`):
  - `.github/workflows/pr-auto-base.yml`
  - `.github/workflows/staging-release-prep.yml`
  - `eslint.config.mjs`
  - `index.ts`
  - `lib/logger.ts`
  - `lib/prompts/codex.ts`
  - `lib/prompts/opencode-codex.ts`
  - `lib/request/fetch-helpers.ts`
  - `lib/request/request-transformer.ts`
  - `package-lock.json`
  - `package.json`
  - `test/logger.test.ts`
  - `test/session-manager.test.ts`

## Notable conflict locations (line references from current workspace)
- `index.ts`: bridge fetch creation formatting and indentation around ~126-148.
- `lib/logger.ts`: toast/app log forwarding logic around ~142-178.
- `lib/prompts/codex.ts`: cache metadata handling and ETag logic around ~177-270.
- `lib/prompts/opencode-codex.ts`: cache migration/ETag fetch helpers around ~88-357.
- `lib/request/fetch-helpers.ts`: compaction settings and error enrichment around ~166-470.
- `lib/request/request-transformer.ts`: imports, compaction, prompt cache key, bridge/tool injection across file (multiple conflicts starting near top and ~620-1210).
- Workflows: `pr-auto-base.yml` trigger/permissions/checkout around ~5-53; `staging-release-prep.yml` release branch/tag creation and PR automation around ~25-296.
- Config/test files: `eslint.config.mjs` test overrides (~95-100); `test/logger.test.ts` toast/console expectations (~1-190); `test/session-manager.test.ts` metrics variable naming (~159-165); `package.json` & `package-lock.json` version bump (0.3.0 vs 0.2.0).

## Definition of Done
- All merge conflicts resolved with cohesive logic that preserves newer behaviors (cache handling, logging/toast routing, compaction settings, workflow automation, version 0.3.0).
- TypeScript sources compile conceptually (no mixed indentation or stale references).
- Package metadata consistent across `package.json` and `package-lock.json`.
- Workflow YAML passes basic syntax review.
- Relevant tests updated to match behavior (logger toast routing, session metrics variable consistency).
- `git status` clean of conflict markers; ready for commit.

## Plan (phased)
### Phase 1 – Workflows & Config
- Merge `.github/workflows/pr-auto-base.yml` to include checkout + sync/reopen triggers, correct permissions, GH repo usage.
- Merge `.github/workflows/staging-release-prep.yml` retaining branch/tag push and auto-merge reviewer steps.
- Restore `eslint.config.mjs` test overrides for max-lines.

### Phase 2 – Core Source Merges
- Align `index.ts` fetch creator call with repository style (spaces, no tabs).
- Resolve `lib/logger.ts` to avoid duplicate warn logging when toast available while still forwarding error logging.
- Merge `lib/prompts/codex.ts` with unified cache metadata handling and fallback semantics.
- Merge `lib/prompts/opencode-codex.ts` using fresh cache/ETag helpers and migration checks.
- Merge `lib/request/fetch-helpers.ts` compaction settings builder and enriched error handling using helper functions.
- Merge `lib/request/request-transformer.ts` (imports, prompt cache handling, compaction options, bridge/tool injection) ensuring Codex-mode defaults and logging.

### Phase 3 – Packages & Tests
- Set version to 0.3.0 in `package.json` and `package-lock.json`; keep dependency blocks aligned.
- Update `test/logger.test.ts` to match toast + logging behavior and `OpencodeClient` typing.
- Fix `test/session-manager.test.ts` minor variable naming conflict.

### Phase 4 – Verification
- Run targeted tests if time allows (logger/session transformer) via `npm test -- logger` subset or full `npm test` if feasible.
- Final `git status` check for cleanliness.
