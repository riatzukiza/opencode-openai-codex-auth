# Review v0.3.5 fixes

## Scope

- Handle null/empty cache reads in `lib/prompts/codex.ts` around readCachedInstructions caching logic
- Remove redundant cloning in `lib/request/compaction-helpers.ts` (removeLastUserMessage, maybeBuildCompactionPrompt)
- Prevent duplicate tool remap injection in `lib/request/input-filters.ts` addToolRemapMessage

## Existing issues / PRs

- None identified for this branch (review/v0.3.5).

## Definition of done

- safeReadFile null results do not get cached as empty content; fallback logic remains available for caller
- Compaction helpers avoid unnecessary clones while preserving immutability semantics (original input reused unless truncated)
- Tool remap message is only prepended once when tools are present; logic handles undefined/null safely
- All relevant tests updated or added if behavior changes; existing suite passes locally if run

## Requirements / notes

- Only cache instructions when actual non-empty content is read; on null either warn and return null or allow existing fallback paths
- removeLastUserMessage should find last user role index and slice; when commandText is falsy reuse originalInput directly in maybeBuildCompactionPrompt
- addToolRemapMessage should fingerprint or compare TOOL_REMAP_MESSAGE and skip if already present (matching role/type/text)
- Preserve existing function signatures and return types throughout
