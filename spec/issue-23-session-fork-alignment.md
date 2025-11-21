# Issue #23 – SessionManager fork alignment

## Context

- Issue: https://github.com/open-hax/codex/issues/23
- Follow-up to PR #20 CodeRabbit review discussion on `extractForkIdentifier`.
- Problem: `lib/session/session-manager.ts` uses fork hints limited to `forkId|fork_id|branchId|branch_id` (~lines 120-143). Prompt cache fork derivation in `lib/request/prompt-cache.ts` also accepts `parentConversationId|parent_conversation_id` (~lines 70-132). Requests that set only parent conversation IDs diverge: prompt cache key suffix includes fork hint, session key does not.

## Affected areas

- `lib/session/session-manager.ts` (extract fork keys, session key construction)
- `lib/request/prompt-cache.ts` (source of fork hint keys)
- Tests: `test/session-manager.test.ts` (missing coverage for parent conversation fork hints)

## Requirements / Definition of Done

- Session key and prompt cache key derivation use the same set of fork hint keys (including parent conversation IDs) so forks stay consistent regardless of hint field used.
- Normalize/trim behavior remains consistent with existing fork handling; no regressions for current fork/branch keys.
- Add/adjust tests to cover parent conversation fork hint path.
- Build/tests pass.

## Plan (phases)

1. Analysis: Confirm current fork key sources in session manager vs prompt cache; note normalization differences and existing tests.
2. Design/Implementation: Share or mirror fork key list to include parent conversation IDs in session manager; keep trim behavior; ensure prompt cache alignment comments updated. Update session manager logic accordingly, adjusting helper if needed.
3. Verification: Add/extend session manager tests for parent conversation fork hints and run relevant test subset (session manager + prompt cache if needed).

## Changelog

- 2025-11-20: Exported prompt cache fork key list for reuse, aligned SessionManager fork extraction with parent conversation hints, and added session-manager tests covering parent conversation fork identifiers.
