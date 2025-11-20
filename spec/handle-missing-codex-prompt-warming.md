# Handle missing codex prompt warming

## Scope
- Review uncommitted changes on branch `chore/handle-missing-codex-prompt-warming` for plugin log prefix and fallback prompt fetch handling.

## Relevant files & line notes
- `lib/constants.ts`:6-8 rename `PLUGIN_NAME` to `openhax/codex` for logging identity.
- `lib/logger.ts`:144-158 log gating simplified to always mirror warn/error/info when enabled; removes test-env suppression.
- `lib/prompts/opencode-codex.ts`:15-131 adds dev+main fallback URLs, stores `sourceUrl`, handles 304/etag per-source, logs last error, caches when available.
- `lib/request/response-handler.ts`:36-79 updates empty-body error prefix to new plugin name.
- Tests updated for new prefixes and caching behavior: `test/auth.test.ts`, `test/constants.test.ts`, `test/logger.test.ts`, `test/prompts-codex.test.ts`, `test/prompts-opencode-codex.test.ts` (new legacy URL fallback test).
- Docs updated to reflect new logging prefix: `docs/configuration.md`, `docs/development/ARCHITECTURE.md`, `docs/development/TESTING.md`.

## Existing issues / PRs
- No linked issues or PRs referenced in the changes.

## Requirements
- Ensure logging prefix consistently uses `openhax/codex` across code, tests, docs.
- OpenCode prompt fetcher should fall back to main branch when dev URL fails, preserving cache metadata including source URL.
- Maintain ETag-based caching and cache-hit/miss metrics with session/file caches.
- Tests should cover prefix changes and new fallback path.

## Definition of done
- All modified files aligned on new plugin identifier.
- OpenCode codex prompt fetch resilient when dev URL missing; cache metadata persists `sourceUrl` and uses correct conditional requests.
- Unit tests updated/passing; docs reflect logging prefix.
- Branch ready with meaningful commit(s) and PR targeted to staging.

## Notes
- Untracked spec files present (`spec/opencode-prompt-cache-404.md`, `spec/plugin-name-rename.md`); keep intact.
- Build/test commands: `npm test`, `npm run build`, `npm run typecheck` per AGENTS.md.
