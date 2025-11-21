# Prefix diagnostics for cache warnings

## Context

- Repeated warnings `SessionManager: prefix mismatch detected ...` do not explain whether a cache prefix changed because the system prompt shifted, OpenCode pruned earlier tool results, or some other drift.
- Prefix comparison happens after request transformation (post bridge/system filtering), so the mismatch data needs to come from `SessionManager.applyRequest()`.

## Code links

- `lib/session/session-manager.ts:93-360` — session context retrieval and prefix comparison; warnings emitted on mismatches/forks.
- `lib/request/request-transformer.ts:86-147` — transformation pipeline that feeds `SessionManager`, including cache key derivation.
- `lib/request/input-filters.ts:18-272` — system prompt filtering + bridge injection that can affect the cached prefix shape.

## Existing issues / PRs

- Spec `spec/session-prefix-mismatch.md` tracks earlier prefix churn; no open PRs found tied to cause attribution in logs.

## Definition of done

- Warning logs for prefix mismatches classify whether the divergence stems from a system/developer prompt change, OpenCode context pruning (detected loss of leading history/tool results), or an unknown/other cause.
- Added metadata makes it easy to pinpoint removed segments (counts/types/hashes) without changing session behavior.
- Tests cover the new classification helper and ensure existing session reuse/fork behaviors remain intact.

## Requirements

- Add a lightweight diff classifier in `SessionManager.applyRequest` that inspects the previous vs incoming inputs when a mismatch occurs.
- Include classification + concise evidence in `logWarn` payloads for both regenerate and fork paths.
- Treat OpenCode pruning heuristically (e.g., incoming input matches a suffix of the prior turn and dropped items include tool/result roles).
- Keep hashing/clone behavior unchanged; do not alter prompt cache key computation or transformation order.
