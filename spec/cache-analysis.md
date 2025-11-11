# Cache Comparison Analysis Spec

## Objective
Summarize caching behaviors across this plugin, the upstream `openai/codex` CLI, and the `sst/opencode` runtime to identify potential cache correctness issues (prompt caching, instruction caching, session reuse) that could affect bridging Codex into OpenCode.

## Code References
- `lib/cache/session-cache.ts:32-114` – local TTL-based session cache implementation with eviction metrics hooks.
- `lib/cache/cache-warming.ts:30-151` – startup warming sequence and warm-state probes.
- `lib/prompts/codex.ts:20-158` – GitHub-backed Codex instruction caching (15 min TTL, release tag probes, bundled fallback).
- `lib/prompts/opencode-codex.ts:33-125` – OpenCode prompt caching + ETag metadata persistence.
- `lib/request/request-transformer.ts:675-747` – handling of prompt cache keys and include list for stateless operation.
- `lib/session/session-manager.ts:155-227` – prompt cache key generation, prefix hashing, reset strategy, and cached token bookkeeping.
- `index.ts:124-211` – how warm caches + session manager integrate into fetch flow.

### Upstream `openai/codex`
- `codex-rs/core/src/client.rs:L246-L268` – always attaches `prompt_cache_key` = conversation ID; handles `store` toggling per provider.
- `codex-rs/core/src/client_common.rs:L276-L331` – payload structure includes `prompt_cache_key`, `store`, reasoning + verbosity defaults.
- `codex-rs/core/tests/suite/prompt_caching.rs:L481-L640` – reference behavior for cache reuse, prefix consistency, and overrides.
- `codex-rs/core/src/conversation_manager.rs:L96-L251` – lifecycle for sessions, fork handling, and history reuse guarantees.

### `sst/opencode`
- `packages/opencode/src/provider/transform.ts:L86-L118` – provider option shaping, automatic `promptCacheKey` assignment, and runtime-specific defaults (`include`, `reasoningSummary`).

## Existing Issues / PRs
- Issues are disabled on this repository (`gh issue list -L 5`).
- Open PRs: #2 `this is a thing` (branch `bug-fix/compaction`, opened 2025-11-11T01:50:35Z).

## Requirements
1. Map cache responsibilities for instructions, prompts, and session state across all three runtimes.
2. Highlight behavioral gaps where this plugin diverges from Codex CLI guarantees (e.g., prompt prefix stability, `prompt_cache_key` management, TTL policies).
3. Contrast with OpenCode runtime expectations (session IDs, provider defaults) to flag integration risks.
4. Produce actionable list of potential caching issues plus validation steps.

## Definition of Done
- Written comparison covering instruction caching, prompt caching, bridge prompt deduping, and session cache key management.
- At least three concrete issue hypotheses backed by file references (include upstream references where applicable).
- Recommendations for instrumentation or tests to validate each hypothesis.
- Proposed validation/mitigation steps align with both Codex CLI behavior and OpenCode runtime constraints.

## Plan (Phases)
1. **Discovery** – Review this repo's cache modules, session manager, and request transformer (completed per references above).
2. **Upstream Baseline** – Document how `openai/codex` handles prompt caching/session reuse (client + tests reviewed).
3. **Runtime Contrast** – Capture relevant parts of `sst/opencode` provider transformations impacting caching.
4. **Synthesis** – Enumerate differences, identify risks, and recommend mitigations/tests (pending).
