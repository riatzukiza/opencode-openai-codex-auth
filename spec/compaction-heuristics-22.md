# Issue 22 – Compaction heuristics metadata flag

**Issue**: https://github.com/open-hax/codex/issues/22 (follow-up to PR #20 review comment r2532755818)

## Context & Current Behavior

- Compaction prompt sanitization lives in `lib/request/input-filters.ts:72-165` (`filterOpenCodeSystemPrompts`). It relies on regex heuristics over content to strip OpenCode auto-compaction summary-file instructions.
- Core filtering pipeline in `lib/request/request-transformer.ts:38-75` runs `filterInput` **before** `filterOpenCodeSystemPrompts`; `filterInput` currently strips `metadata` when `preserveIds` is false, so any upstream metadata markers are lost before heuristic detection.
- Compaction prompts produced by this plugin are built in `lib/compaction/codex-compaction.ts:88-99` via `buildCompactionPromptItems`, but no metadata flags are attached to identify them as OpenCode compaction artifacts.
- Tests for the filtering behavior live in `test/request-transformer.test.ts:539-618` and currently cover regex-only heuristics (no metadata awareness).

## Problem

Heuristic-only detection risks false positives/negatives. Review feedback requested an explicit metadata flag on OpenCode compaction prompts (e.g., `metadata.source === "opencode-compaction"`) and to prefer that flag over regex checks, falling back to heuristics when metadata is absent.

## Solution Strategy

### Phase 1: Metadata flag plumbing

- Tag plugin-generated compaction prompt items (developer + user) with a clear metadata flag, e.g., `metadata: { source: "opencode-compaction" }` or boolean `opencodeCompaction`. Ensure the flag survives filtering.
- Adjust the filtering pipeline to preserve metadata long enough for detection (e.g., allow metadata passthrough pre-sanitization or re-order detection vs. stripping) while still removing other metadata before sending to Codex backend unless IDs are preserved.

### Phase 2: Metadata-aware filtering

- Update `filterOpenCodeSystemPrompts` to first check metadata flags for compaction/system prompts and sanitize/remove based on that before running regex heuristics. Heuristics remain as fallback when metadata is missing.
- Ensure system prompt detection (`isOpenCodeSystemPrompt`) remains unchanged.

### Phase 3: Tests

- Expand `test/request-transformer.test.ts` to cover:
  - Metadata-tagged compaction prompts being sanitized/removed (preferred path).
  - Fallback to heuristics when metadata flag is absent.
  - Metadata preserved just long enough for detection but not leaked when `preserveIds` is false.

## Definition of Done / Requirements

- [x] Incoming OpenCode compaction prompts marked with metadata are detected and sanitized/removed without relying on text heuristics.
- [x] Heuristic detection remains functional when metadata is absent.
- [x] Metadata needed for detection is not stripped before filtering; final output still omits metadata unless explicitly preserved.
- [x] Tests updated/added to cover metadata flag path and fallback behavior.

## Files to Modify

- `lib/compaction/codex-compaction.ts` – attach metadata flag to compaction prompt items built by the plugin.
- `lib/request/input-filters.ts` – prefer metadata-aware detection and keep heuristics as fallback.
- `lib/request/request-transformer.ts` – ensure metadata survives into filter stage (ordering/options tweak) but is removed thereafter when appropriate.
- `test/request-transformer.test.ts` – add coverage for metadata-flagged compaction prompts and fallback behavior.

## Change Log

- 2025-11-20: Implemented metadata flag detection/preservation pipeline, tagged compaction prompt builders, added metadata-focused tests, and ran `npm test -- request-transformer.test.ts`.
