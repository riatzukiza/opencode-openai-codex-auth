# Issue Triage — 2025-11-20

Scope: Verify status of open issues #6, #23, #22, #21, #39, #24, #40 against current main branch.

## Findings

- #23 SessionManager fork sync — Not done. `lib/session/session-manager.ts` extractForkIdentifier only checks `forkId|fork_id|branchId|branch_id` (lines ~120-143); does not consider `parentConversationId|parent_conversation_id` used in prompt cache derivation.
- #22 Compaction metadata flag — Not done. `lib/request/input-filters.ts` uses regex heuristics only to detect OpenCode compaction prompts (lines ~82-139); no metadata flag preferred path.
- #21 Summary-aware tail extraction — Not done. `lib/compaction/codex-compaction.ts` `extractTailAfterSummary` returns slice from last `user` message (lines ~120-129); no summary marker awareness.
- #24 Tests clarify tail semantics — Not done. `test/codex-compaction.test.ts` still names test "extracts tail after the latest user summary message" and asserts last-user behavior (lines ~80-89).
- #39 README installation section missing — Not done. README links to `#installation` (e.g., line ~531) but no `## Installation` heading exists.
- #40 Model stats HTML dashboard server — Not started. No references to "dashboard"/"stats html" in repo.
- #6 Richer metrics/inspect commands — Still blocked by upstream; no new implementation detected.

## Definition of Done (per issue)

- #23: Session key fork detection matches prompt cache fork hints (`parentConversationId` variants) with tests.
- #22: Input filtering prefers explicit metadata flag for OpenCode compaction prompts, falling back to heuristics.
- #21: Tail extraction skips summary-marked items; tests updated.
- #24: Tests renamed/rewritten to reflect current semantics and cover summary-aware path once added.
- #39: README gains actual Installation section and linked anchor.
- #40: Dashboard server implemented or scoped; code/tests/docs added.
- #6: Upstream dependency resolved; enhanced metrics/inspect commands implemented and tested.
