# Issue 4 – Fork-aware prompt_cache_key and non-structural overrides

**Issue**: https://github.com/open-hax/codex/issues/4 (open)

## Context & Current Behavior
- `lib/request/request-transformer.ts:856-1043` — `ensurePromptCacheKey` now normalizes metadata-derived keys to `cache_<base>` and appends `-fork-<id>` when `forkId/branchId/parentConversationId` is present; otherwise derives deterministic hashed fallback `cache_<hash>`.
- `lib/request/request-transformer.ts:915-1043` — Transform pipeline logs when deriving/generating keys with hint details and fallback hashes.
- `lib/session/session-manager.ts:83-206` — SessionManager derives session IDs from conversation metadata or host-provided cache key; resets cache key on prefix mismatch; preserves prompt_cache_key continuity when possible.
- `test/request-transformer.test.ts:715-850` — Tests cover preserving host keys, metadata derivation, fork suffix (`-fork-<id>`), stability across non-structural overrides, and deterministic fallback generation.

## Gaps vs Issue Requirements
- Fork derivation is normalized but not yet numbered; relies on provided fork identifiers/metadata.
- Fallback keys are hashed but still lack explicit numbering for forks (pending if required later).
- Logging does not surface when fallback occurs despite having conversation-like metadata; need stronger WARN.
- No tests mirroring Codex CLI semantics for: constant keys across soft overrides, distinct keys for forks with numbering/hashing, deterministic fallback reuse across transforms.

## Plan (Phases)
1) **Design & Hooks**: Decide fork-key schema (`cache_<base>` + `-fork-<n>`), define what counts as fork metadata (forkId/branchId, future parentConversationId), and how to seed numbering from metadata vs. fallback detection.
2) **Implementation**: Update `ensurePromptCacheKey` (and helpers) to:
   - Normalize base cache key from metadata/host; seed fork suffix with deterministic numbering when forks requested; keep stability across soft overrides.
   - Detect conversation-like hints when falling back; emit warn and include short hash of input/fallback seed (`cache_<hash>-<uuid>` or similar) to reduce accidental reuse.
   - Ensure SessionManager interactions remain compatible (no regressions on prefix matching).
3) **Tests & Docs**: Add unit coverage in `test/request-transformer.test.ts` (fork numbering, fallback hash stability across transforms, soft-override stability, fork distinction). Update docs if behavior changes materially (configuration/getting-started sections mentioning prompt_cache_key behavior).

## Definition of Done / Requirements
- Prompt cache key derivation mirrors Codex CLI semantics: stable across soft overrides (temperature/max tokens/reasoning fields), distinct for explicit forks, deterministic fallback reuse for identical bodies, and warns when fallback occurs despite conversation hints.
- New/updated tests in `test/request-transformer.test.ts` cover: (a) stable key with overrides, (b) fork-specific keys with deterministic suffix/numbering, (c) fallback key reuse with hash component, (d) warning path when conversation-like metadata is unusable.
- Code builds and relevant tests pass (`pnpm test` at minimum; broader suites as needed).
- No regression to SessionManager behavior or existing prompt_cache_key consumers.
