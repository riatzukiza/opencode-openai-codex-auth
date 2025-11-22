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
4. **Synthesis** – Enumerate differences, identify risks, and recommend mitigations/tests.

---

## Phase 3 – Runtime Contrast Findings

### Instruction Caching Responsibilities

- **Plugin (`lib/prompts/codex.ts:20-158`)** – Fetches the Codex CLI instructions straight from the latest GitHub release, writes them to `~/.opencode/cache/codex-instructions.md`, and mirrors them into an in-memory session cache under both the release-specific key (`codex:{etag}:{tag}`) and the sentinel key `"latest"`. Cache warming (`lib/cache/cache-warming.ts:30-94`) simply calls these fetchers and records the result, so the plugin is responsible for both persistence and warm-up heuristics.
- **Codex CLI (`codex-rs/core/src/client.rs`, payload builder around `ResponsesApiRequest`)** – Ships the instructions with the binary and always injects them per request via `prompt.get_full_instructions()`. There is no runtime fetch, which means the CLI never risks network failures while pulling the prompt, but it also means end users must upgrade the CLI to pick up a new instruction release.
- **OpenCode Runtime (`packages/opencode/src/provider/transform.ts`)** – Delegates instruction management entirely to the provider. The runtime does not attempt to cache Codex instructions; it only sets provider options (e.g., `promptCacheKey`, `include`, `reasoningSummary`). When this plugin is active, OpenCode expects the provider (us) to guarantee that instruction caching matches Codex's expectations.

### Prompt + Session Caching Responsibilities

- **Codex CLI** – Always sets `prompt_cache_key = conversation_id` on every Responses API call and keeps the entire prefix (instructions + environment context + full history) byte-identical between turns (`codex-rs/core/tests/suite/prompt_caching.rs`). This guarantees that the backend cache can reuse encrypted reasoning and prefix tokens whenever the key repeats.
- **OpenCode Runtime** – Uses `ProviderTransform.options()` to set `promptCacheKey = sessionID` (for both the built-in OpenCode provider and OpenAI-compatible providers) and to force `store: false`, `include: ["reasoning.encrypted_content"]`, and `reasoningSummary: "auto"` when targeting gpt-5-family models. OpenCode _assumes_ that the downstream provider will faithfully reuse the prefix that corresponds to this key.
- **Plugin** – Extracts host-provided keys from either `prompt_cache_key`, `promptCacheKey`, or nested metadata (`lib/request/request-transformer.ts:692-706`) and, if prompt caching is enabled, replaces them with a sanitized per-session key maintained by `SessionManager` (`lib/session/session-manager.ts:117-214`). Prefix tracking relies on the exact JSON structure of the filtered input (`filterInput` strips IDs but leaves metadata intact), and prefix mismatches trigger a new random `prompt_cache_key` via `resetSessionInternal()`.

### Cache Warm / Diagnostics Responsibilities

- `warmCachesOnStartup()` cleans expired entries, fetches Codex + OpenCode prompts, and records which cache warmed (`lib/cache/cache-warming.ts:30-94`).
- `areCachesWarm()` and the `/codex-metrics` command rely on sentinel keys (`"latest"` and `"main"`) instead of TTL metadata, so a cache entry is considered warm as long as it still lives in memory, regardless of whether the underlying ETag is stale.
- `getCacheWarmingStats()` currently re-invokes the fetchers, which can trigger additional network requests even when the caller only needs a snapshot—unlike the Codex CLI, which never has to re-fetch instructions for diagnostics.

---

## Phase 4 – Synthesis & Issue Hypotheses

### 1. Prompt caching is opt-in, unlike Codex CLI defaults

- **Evidence**: `index.ts:123-125` instantiates `SessionManager` with `enabled = pluginConfig.enablePromptCaching ?? false`, so caching is _disabled_ unless users flip a config switch. Codex CLI always attaches a `prompt_cache_key` (`codex-rs/core/src/client.rs`, `ResponsesApiRequest` builder) and therefore guarantees cache reuse.
- **Risk**: Any OpenCode workflow that forgets to set `promptCacheKey` (custom providers, tests, future refactors) will run fully stateless through this plugin, even though we aggressively strip IDs and system prompts. That yields zero cache hits and higher token usage than either OpenCode or the Codex CLI expect.
- **Mitigation / Validation**:
  - Default `enablePromptCaching` to `true`, or automatically fall back to `SessionManager` when no host key is present.
  - Add a unit test that exercises `transformRequestForCodex()` with `enablePromptCaching=false` and missing host key, asserting that the plugin still emits a sanitized `prompt_cache_key`.
  - Instrument the fetch path to log (at debug level) whenever we forward a request without any cache key so that we can catch misconfigurations early.
- **Mitigation status**: Implemented via `index.ts:121-130` (prompt caching default + warning) and `lib/request/request-transformer.ts:645-712` (auto-derives or generates `prompt_cache_key`), with regression tests in `test/request-transformer.test.ts:546-586`.

### 2. Prefix comparisons include volatile metadata, causing spurious cache resets

- **Evidence**: `sharesPrefix()` (`lib/session/session-manager.ts:38-57`) uses `JSON.stringify` over the entire filtered input. `filterInput()` (`lib/request/request-transformer.ts:389-412`) removes IDs but keeps every `metadata` object untouched. OpenCode frequently stamps messages with per-turn metadata (trace IDs, sandbox policy diffs, file lists), so two logically identical prefixes may fail the byte-for-byte comparison even though only metadata changed. Codex CLI avoids this by constructing the prefix itself (see the `prompt_caching.rs` tests verifying exact prefix reuse even when environment overrides apply).
- **Risk**: Every metadata mutation forces `SessionManager` to call `resetSessionInternal(..., true)`, generating a brand-new `prompt_cache_key`. That makes cache hit rates fall toward zero, exactly the problem the CLI tests guard against.
- **Mitigation / Validation**:
  1. Strip volatile `metadata` fields (or canonicalize them) inside `filterInput()` whenever `preserveIds` is false.
  2. Add a regression test that feeds identical content with differing metadata into `SessionManager.applyRequest()` and asserts that `sharesPrefix` still returns true.
  3. Extend `/codex-metrics` to surface how many prefix mismatches were caused purely by metadata differences to make the problem observable.
- **Mitigation status**: `filterInput()` now removes metadata when operating in stateless mode (`lib/request/request-transformer.ts:389-421`) and `test/request-transformer.test.ts:245-280` guards the behavior; IDs/metadata are only preserved when `preserveIds` is true to keep host-managed sessions stable.

### 3. Session cache never evicts, diverging from Codex conversation lifecycle

- **Evidence**: `SessionManager` stores every conversation in an in-memory `Map` with no TTL or size cap (`lib/session/session-manager.ts:108-214, 273-313`). There is no `remove` call anywhere in the plugin. In contrast, the Codex CLI `ConversationManager` exposes `remove_conversation()` (`codex-rs/core/src/conversation_manager.rs`) and reuses conversations created via CLI flows, so memory usage is bounded by active chats.
- **Risk**: An OpenCode user who runs many short-lived sessions (e.g., multiple `opencode run` commands) will accumulate unbounded session state inside the plugin process, eventually degrading cache lookup time or exhausting memory. Worse, `/codex-metrics` will report stale "recent sessions" even after the conversations are gone, obscuring real cache health.
- **Mitigation / Validation**:
  - Add LRU- or TTL-based eviction with metrics (e.g., drop sessions that have been idle for >30 minutes).
  - Create a stress test that spawns N synthetic conversations, verifies that `getMetrics()` caps recent sessions, and asserts that memory does not grow linearly once the cap is reached.
  - Hook into the plugin lifecycle (e.g., when a request finishes with `sessionContext.isNew === false` and no further turns arrive) to prune session entries similar to `ConversationManager::remove_conversation`.
- **Mitigation status**: `lib/session/session-manager.ts:1-215` now enforces `SESSION_IDLE_TTL_MS` + `SESSION_MAX_ENTRIES`, pruning maps on every `getContext()` call, and `test/session-manager.test.ts:152-197` verifies idle/overflow eviction scenarios.

### 4. Diagnostics may trigger unwanted network fetches

- **Evidence**: `getCacheWarmingStats()` (`lib/cache/cache-warming.ts:121-149`) calls `getCodexInstructions()` and `getOpenCodeCodexPrompt()`, both of which perform ETag-guarded network requests when TTL has expired. Codex CLI diagnostics run entirely offline because the instructions are bundled.
- **Risk**: Invoking a diagnostics endpoint (or `/codex-metrics` once it exposes warm stats) could accidentally spam GitHub, undermining the "zero network" goal of the command and masking real cold-start issues.
- **Mitigation / Validation**:
  - Introduce lightweight "peek" helpers that only inspect the session cache (`codexInstructionsCache.get("latest")`, `openCodePromptCache.get("main")`) and rely on persisted metadata for freshness.
  - Add a unit test that stubs the fetchers to throw and assert that diagnostics still succeed (ensuring the new path never triggers network I/O).
- **Mitigation status**: `lib/cache/cache-warming.ts:123-150` now exposes `getCacheWarmSnapshot()` / `getCacheWarmingStats()` without issuing network requests, and the `/codex-metrics` command consumes the shared helper (see `lib/commands/codex-metrics.ts:2-45`, `test/cache-warming.test.ts:167-210`).

These hypotheses satisfy the spec requirements: they pinpoint divergences between this plugin, the Codex CLI, and OpenCode's provider expectations, and each comes with explicit instrumentation/test follow-ups.
