# Codex-Style Compaction Implementation

## References
- Issue: #5 "Feature: Codex-style conversation compaction and auto-compaction in plugin"
- Existing PRs: none as of 2025-11-16 (confirmed via `gh pr list`)
- Upstream reference: `openai/codex` (`codex-rs/core/src/compact.rs` and `templates/compact/*.md`)

## Current State
- `lib/request/request-transformer.ts:530-660` only strips OpenCode auto-compaction prompts; no plugin-owned summary flow exists.
- `lib/commands/codex-metrics.ts` handles `/codex-metrics` and `/codex-inspect` by intercepting the latest user text and returning static SSE responses; no compaction command handler is present.
- `SessionManager` stores prompt-cache metadata but lacks any notion of compaction history or pending auto-compaction state.
- Docs/config files mention OpenCode auto-compaction but have no plugin config for enabling/disabling Codex-specific compaction.

## Requirements
1. Manual compaction command:
   - Recognize `/codex-compact`, `/compact`, and `codex-compact` user inputs (case-insensitive) before the request hits Codex.
   - Replace the outgoing request body with a Codex-style compaction prompt constructed from the filtered conversation history.
   - Return the Codex-generated summary to the host as the full response; no downstream tools should run.
2. Auto-compaction heuristics:
   - Add plugin config for `enableCodexCompaction` (manual command toggle, default `true`), `autoCompactTokenLimit` (unset/disabled by default), and `autoCompactMinMessages` (default `8`).
   - When the limit is configured, approximate the token count for the in-flight `input` after filtering; if above limit and turn count ≥ min messages, automatically run a compaction request before sending the user prompt.
   - Auto compaction should respond with the generated summary and include a note telling the user their request was paused until compaction finished (matching Codex CLI expectations).
3. Shared compaction utilities:
   - Port over the Codex CLI `SUMMARIZATION_PROMPT` and `SUMMARY_PREFIX` templates.
   - Provide helper(s) for serializing conversation history into a text blob, truncating old turns to avoid extremely long compaction prompts, and building the synthetic request body used for compaction.
   - Expose consistent metadata (e.g., `{ command: "codex-compact", auto: boolean, truncatedTurns: number }`) on command responses so frontends/tests can assert behavior.
4. Tests:
   - Extend `test/request-transformer.test.ts` to cover manual command rewriting, auto-compaction triggering when thresholds are exceeded, and no-op behavior when thresholds aren't met.
   - Add unit coverage for compaction helpers (new file under `test/` mirroring the module name) validating serialization, truncation, and prompt construction.
5. Documentation:
   - Update `docs/configuration.md` and `README.md` with the new plugin config knobs and CLI usage instructions for `/codex-compact`.
   - Mention auto-compaction defaults (disabled) and how to enable them via `~/.opencode/openhax-codex-config.json`.

## Implementation Plan
### Phase 1 – Config & Prompt Assets
- Update `lib/types.ts` (`PluginConfig`) to add compaction-related fields plus any helper interfaces.
- Create `lib/prompts/codex-compaction.ts` exporting `CODEX_COMPACTION_PROMPT` + `CODEX_SUMMARY_PREFIX` (copied from upstream templates) and metadata about estimated tokens.
- Extend `lib/config.ts` defaults (new keys) and ensure `loadPluginConfig()` surfaces compaction settings.
- Document the options in `docs/configuration.md` and reference them from `README.md`.

### Phase 2 – Compaction Utilities
- Add `lib/compaction/codex-compaction.ts` with helpers:
  - `normalizeCommandTrigger()` (shared with command detection) and `isCompactionCommand(text)`.
  - `serializeConversation(items: InputItem[], options)` returning truncated transcript text + stats about dropped turns.
  - `buildCompactionInput(conversationText: string)` returning the synthetic `InputItem[]` (developer prompt + user transcript) used to call Codex.
  - `approximateTokenCount(items)` used for auto-compaction heuristic.
- Include pure functions for formatting the assistant response when compaction completes (e.g., prefixing with `SUMMARY_PREFIX`).
- Write focused unit tests for this module in `test/codex-compaction.test.ts`.

### Phase 3 – Request Transformation & Command Handling
- Update `transformRequestBody()` to accept compaction config (plumbed from `transformRequestForCodex` → `createCodexFetcher`).
- Inside `transformRequestBody`, before final logging:
  - Detect manual compaction command via helpers; when hit, strip the command message, serialize the rest, and rewrite `body.input` to the compaction prompt. Clear `tools`, set `metadata.codex_compaction = { mode: "command", truncatedTurns }`, and short-circuit auto-compaction heuristics.
  - If no manual command, evaluate auto-compaction threshold; if triggered, generate the same compaction prompt as above, set metadata to `{ mode: "auto", reason: "token_limit" }`, and stash the original user text (we'll prompt the user to resend after compaction message).
- Return a flag along with the transformed body so downstream knows whether this request is a compaction run. (E.g., set `body.metadata.codex_compaction.active = true`.)
- Update `maybeHandleCodexCommand()` (and call site) to an async function so `/codex-metrics` continues to work while compaction is handled upstream. (Manual compaction detection will now live in the transformer rather than command handler, so metrics module only needs minimal changes.)

### Phase 4 – Response Handling & Messaging
- Introduce `lib/request/compaction-response.ts` (or extend existing logic) to detect when a handled response corresponds to a compaction request (based on metadata set earlier).
- For manual command requests: leave the Codex-generated summary untouched so it streams back to the host as the immediate response.
- For auto-compaction-triggered requests: prepend a short assistant note ("Auto compaction finished; please continue") before the summary, so users understand why their prior question wasn't processed.
- Update `session/response-recorder` if needed to avoid caching compaction runs as normal prompt-cache turns (optional but mention in spec if not planned).

### Phase 5 – Documentation & Validation
- Explain `/codex-compact` usage and auto-compaction behavior in README + docs.
- Add configuration snippet example to `docs/configuration.md` and CLI usage example to `README.md`.
- Run `npm test` (Vitest) to confirm the new suites pass.

## Definition of Done
- `/codex-compact` command rewrites the outgoing request into a Codex-style compaction prompt and streams the summary back to the user.
- Optional auto-compaction runs when thresholds are exceeded and informs the user via assistant response.
- Compaction helper tests verify serialization/truncation rules; `request-transformer` tests assert rewriting + metadata behavior.
- Documentation reflects the new commands and configuration switches.
