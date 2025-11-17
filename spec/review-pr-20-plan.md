# Review Plan for PR #20 (Device/stealth)

## Overview
- Address coderabbitai's remaining comments on https://github.com/open-hax/codex/pull/20 before merging.
- Focus on fixing the failing `test/plugin-config.test.ts` assertions and strengthening compaction-related logic.

## Target files and lines
1. `test/plugin-config.test.ts` (≈90‑140): Remove duplicate `it('should handle file read errors gracefully')`, keep a single error-handling test that asserts the current `PluginConfig` defaults (`codexMode`, `enablePromptCaching`, `enableCodexCompaction`, `autoCompactMinMessages`) and verifies warning logging.
2. `lib/request/fetch-helpers.ts` (≈34‑55): Guard `sessionManager?.applyCompactedHistory` behind `compactionEnabled` so `enableCodexCompaction = false` truly disables history reuse.
3. `lib/request/request-transformer.ts` (≈896‑977): Wrap `computeFallbackHashForBody` serialization in `try/catch` and fall back to hashing just the `model` string when metadata is not JSON-safe.

## Existing references
- Open PR: open-hax/codex#20 (Device/stealth branch). Coderabbitai submitted reviews on commits f56e506e0f07… and 8757e76457dc… with blockers noted above.
- No upstream GitHub issues are cited; the actionable items come solely from the reviewer’s comments.

## Definition of done
1. `test/plugin-config.test.ts` compiles, contains no duplicate `it` names, and asserts the current default config (includes `enableCodexCompaction` and `autoCompactMinMessages`), logging expectations remain within the test body.
2. `transformRequestForCodex` only applies compacted history when `pluginConfig.enableCodexCompaction !== false` (in addition to the existing manual command guard).
3. `computeFallbackHashForBody` no longer throws when metadata/input contain non-serializable values; it falls back to hashing a stable string (e.g., `model`).
4. Documented plan is shared in PR comment before implementing code.
5. Tests covering touched files pass locally (at least the relevant suites).
6. Changes committed, pushed, and the reviewer notified via response.

## Requirements
- Must respond on PR with the plan before coding begins.
- Keep existing tests (plugin config, fetch helpers, session manager) green after modifications.
- Preserve logging expectations in relevant tests (use spies to verify warnings in failure cases).
- Push updates to the same branch once changes and tests are complete.
