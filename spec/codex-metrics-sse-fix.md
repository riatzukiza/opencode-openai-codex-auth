# /codex-metrics SSE Response Compliance

## Summary
- `/codex-metrics` currently emits a single SSE chunk that embeds a full Responses JSON object (`lib/commands/codex-metrics.ts:33-185`).
- OpenAI's Responses streaming contract expects typed SSE events such as `response.created`, `response.output_text.delta`, and `response.completed`. The plugin's chunk lacks a `type` field and therefore fails schema validation inside the CLI (see AI_TypeValidationError in user report).
- We must emit a minimal-but-valid SSE sequence that mirrors the Responses API so that `codex-metrics` can run without hitting the network while still satisfying downstream validators.

## Existing Issues / PRs
- Related: `gh issue list` entry #6 ("Feature: richer Codex metrics and request inspection commands", opened 2025-11-14). This bug fix unblocks the metrics command introduced there.
- No open PRs touching this area (`gh pr list --limit 5` returned none).

## Key Files / References
| File | Notes |
| --- | --- |
| `lib/commands/codex-metrics.ts:33-185` | Builds `/codex-metrics` response and currently serializes ad-hoc SSE payload via `createSsePayload`. Needs rewrite to emit typed events. |
| `lib/types.ts:158-163` | Defines `SSEEventData` used by `response-handler`. Final event must satisfy this parser (`type` + `response`). |
| `lib/request/response-handler.ts:1-88` | Consumes SSE stream by searching for `response.done`/`response.completed`. Command response must include such an event so `convertSseToJson` keeps working if invoked downstream. |
| `test/codex-metrics-command.test.ts:33-335` | Assumes the SSE chunk is the final JSON payload. Tests must be updated to reflect typed events and to assert on `response.completed.response`. |

## Requirements / Definition of Done
1. `createStaticResponse()` emits SSE events that conform to the Responses API schema:
   - `response.created` event with initial metadata.
   - `response.output_text.delta` event carrying the metrics text (single delta is fine).
   - `response.completed` event containing the same `response` payload currently produced, including metadata and usage totals.
   - Trailing `[DONE]` chunk remains for compatibility.
2. All emitted events include the required fields (`type`, `response_id`, `item_id`, `output_index`, `delta`, etc.) so validators no longer complain.
3. Update tests to parse SSE streams by selecting the `response.completed` event and verifying the embedded `response` object as before. Add new assertions covering the intermediate events (created + delta) so the structure stays correct.
4. Ensure the cached token + metadata calculations remain untouched.
5. Document the new SSE behavior inline (brief comment) for future contributors.

## Implementation Plan
**Phase 1 – Reshape SSE serialization**
- Build helper that returns an array of SSE event objects for created, delta, completed events. Each event should reuse the existing response payload (completed event) to avoid duplication.
- Update `createStaticResponse()` to stringify each event as its own `data: {...}\n\n` chunk followed by `[DONE]`.

**Phase 2 – Test updates & validation**
- Update `test/codex-metrics-command.test.ts` helpers to capture the final response via `type === "response.completed"` and to assert presence of preceding `response.created` & `response.output_text.delta` events.
- Add regression test ensuring each event contains required fields (`type`, `response_id`, etc.) to guard against future schema regressions.

**Phase 3 – Verification**
- Run targeted Vitest suite for the command + any affected modules to ensure green tests.
- Manually inspect SSE payload sample (maybe via new helper) to confirm textual output still matches previous human-readable metrics summary.
