# Remove plugin compaction

## Scope

Remove Codex plugin-specific compaction (manual + auto) so compaction is left to OpenCode or other layers.

## Code refs (entry points)

- lib/request/fetch-helpers.ts: compaction settings, detectCompactionCommand, pass compaction options to transform, track compactionDecision.
- lib/request/request-transformer.ts: applyCompactionIfNeeded, skip transforms when compactionDecision present.
- lib/request/compaction-helpers.ts: builds compaction prompt and decision logic.
- lib/compaction/codex-compaction.ts and lib/prompts/codex-compaction.ts: prompt content and helpers (detect command, approximate tokens, build summary).
- lib/compaction/compaction-executor.ts: rewrites responses and stores summaries.
- lib/session/session-manager.ts: applyCompactionSummary/applyCompactedHistory state injections.
- lib/request/input-filters.ts: compaction heuristics and metadata flags.
- lib/types.ts: plugin config fields for compaction.
- lib/request/codex-fetcher.ts: finalizeCompactionResponse usage.
- Tests: compaction-executor.test.ts, codex-compaction.test.ts, compaction-helpers.test.ts, codex-fetcher.test.ts, fetch-helpers.test.ts (compaction section), request-transformer.test.ts (compaction metadata), session-manager.test.ts (compaction state), docs README/configuration/getting-started.

## Definition of done

- Plugin no longer performs or triggers compaction (manual/auto) in request/response flow.
- Plugin config no longer exposes compaction knobs, docs updated accordingly.
- Tests updated/removed to reflect lack of plugin compaction.

## Requirements

- Preserve prompt caching/session behavior unrelated to compaction.
- Avoid breaking tool/transform flow; codex bridge still applied.
- Keep code ASCII and minimal surgical changes.
