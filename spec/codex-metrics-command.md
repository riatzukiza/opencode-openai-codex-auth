# /codex-metrics Command Specification

## Summary
- Implement a built-in `/codex-metrics` slash command so users can inspect cache + session metrics without making a Codex API call.
- Command should return immediately with a human-readable assistant message that lists cache hit/miss stats, session cache status, and warm-cache state.
- Detection happens inside the plugin fetch pipeline *after* we transform the request body but *before* we forward it to the Codex backend, ensuring zero network usage.

## Key Files / References
| File | Purpose |
| --- | --- |
| `index.ts:77-214` | Plugin entry point where fetch interception occurs; add command dispatch before invoking Codex.
| `lib/session/session-manager.ts:1-284` | Provides prompt-cache tracking; extend with a metrics getter for command output.
| `lib/cache/cache-metrics.ts:1-240` | Source of cache hit/miss data; reuse `getCachePerformanceReport()`.
| `lib/cache/cache-warming.ts:8-155` | Exposes `areCachesWarm()` which we can surface in the metrics payload.
| `lib/request/request-transformer.ts:417-515` | Contains helpers for parsing message text; mirror parsing logic for slash-command detection.
| `test/` (add new test file) | Validate that `/codex-metrics` bypasses Codex calls and returns structured JSON.

## Requirements / Definition of Done
1. Detect `/codex-metrics` (case-insensitive, leading/trailing whitespace ignored) in the latest user message of a request.
2. Return an assistant-style JSON response (Responses API shape) summarizing:
   - Cache stats: hits/misses/evictions/hit rate for each cache bucket (`codexInstructions`, `opencodePrompt`, `bridgeDecisions`, overall).
   - Prompt cache status: enabled flag, total sessions tracked, most recent session snapshots (id, cache key, cached tokens, last updated).
   - Cache warming state (Codex instructions + OpenCode prompt warm flags).
3. Completely bypass Codex network calls when the command fires.
4. Expose a `SessionManager.getMetrics()` (or similar) accessor for the stats listed above.
5. Add targeted unit tests covering command detection and payload formatting.
6. Update documentation (README or relevant doc) to mention the new `/codex-metrics` command and what it prints.

## Existing Issues / PRs
- None related (`gh pr list` shows only unrelated work).
