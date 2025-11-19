# Auto Compaction Summary Delivery

## Context
- Users report that after OpenCode auto compaction fires, Codex-based agents respond with messages like `I don’t see the “above summary” you mentioned`, meaning the summarised context never reaches the model.
- CODEX_MODE currently strips any developer/system message that matches the auto-compaction heuristic in `filterOpenCodeSystemPrompts`, so the summary payload gets dropped before the bridge prompt or user instruction runs.

## Affected Code
- `lib/request/request-transformer.ts:539-592` — `filterOpenCodeSystemPrompts()` removes messages detected by `isOpenCodeCompactionPrompt`, with no sanitisation or pass-through, so summaries disappear altogether.
- `test/request-transformer.test.ts:505-583` — lacks coverage for compaction prompts, so regressions around summary preservation go unnoticed.

## External Signals
- GitHub issue [sst/opencode#2945](https://github.com/sst/opencode/issues/2945) discusses context loss after compaction and gives us a user-facing reproduction.
- Direct user transcript provided in this task highlights Codex replying “I don’t see the above summary,” confirming summaries are filtered before they ever reach the agent.

## Requirements
1. Detect OpenCode compaction prompts but **sanitize** them instead of wholesale removal:
   - Keep the actual summary text in the conversation.
   - Strip only noisy guidance about nonexistent summary files or paths.
   - Maintain developer-role metadata so downstream logic (bridge prompt injection, etc.) still works.
2. If a compaction prompt contains nothing except invalid file instructions, drop it to avoid confusing the agent.
3. Add regression tests covering:
   - Summary text survives compaction filtering while path instructions are removed.
   - Pure file-instruction prompts (no summary content) are still discarded.
4. Document behaviour inline so future updates know why compaction prompts are rewritten rather than discarded.

## Definition of Done
- Running `npm test` locally covers the new cases and passes.
- Auto-compaction messages in live sessions now show summaries instead of “missing summary” errors, verified by inspecting transformed input in unit tests (and optionally via manual logging).
- Spec updated with decisions (this file) and commit references once implemented.

## Changelog
- 2025-11-16: Implemented sanitized compaction prompt handling, preserved summaries, and added regression tests covering both summary retention and pure instruction drops.
