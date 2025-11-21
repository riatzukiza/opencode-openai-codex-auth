# Session cache prefix mismatch – bridge injection

## Context

- Repeated log: `SessionManager: prefix mismatch detected, regenerating cache key` (e.g., sessionId `ses_5610847c3ffey8KLQaUCsUdtks`) now appears beyond the first turn, implying cache keys reset every request.
- Suspect flow: `addCodexBridgeMessage` skips reinjection when `sessionContext.state.bridgeInjected` is true, so turn 1 includes the bridge, turn 2 omits it; SessionManager compares the prior bridged input to the new unbridged input and treats it as a prefix mismatch.

## Code links

- `lib/session/session-manager.ts:248-299` — prefix check and regeneration path (`sharesPrefix`, `applyRequest`).
- `lib/request/request-transformer.ts:612-657` — bridge injection with session-scoped skip flag.
- `lib/request/fetch-helpers.ts:119-205` — session context retrieval + transform + `applyRequest` ordering.

## Existing issues / PRs

- None found specific to this regression (branch: `chore/codex-max-release-review`).

## Definition of done

- Bridge/system prompt handling keeps the input prefix stable across sequential tool turns; no repeated prefix-mismatch warnings after the first turn of a conversation.
- `prompt_cache_key` remains stable across multi-turn sessions unless the history genuinely diverges.
- Automated tests cover a multi-turn tool conversation to ensure bridge injection does not trigger SessionManager resets.

## Requirements

- Add a regression test demonstrating stable caching across consecutive turns with the bridge prompt injected.
- Adjust bridge injection or prefix handling so SessionManager sees a consistent prefix across turns.
- Keep existing behavior for tool normalization intact; avoid altering host-provided prompt_cache_key semantics.
