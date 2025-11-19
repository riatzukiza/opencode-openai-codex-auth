# OpenCode Prompt Cache 404

## Context
- Timestamped warnings during startup show `getOpenCodeCodexPrompt` failing to seed cache due to 404 on codex.txt (logs at 2025-11-19, default config path missing).
- Current fetch URL targets `sst/opencode` on the `main` branch, which no longer hosts `packages/opencode/src/session/prompt/codex.txt`.

## Existing Issues / PRs
- No related issues/PRs reviewed yet; check backlog if needed.

## Code Files & References
- lib/prompts/opencode-codex.ts:15 – `OPENCODE_CODEX_URL` points to raw GitHub main branch and returns 404.
- lib/cache/cache-warming.ts:41-99 – startup warming logs errors when `getOpenCodeCodexPrompt` fails.
- lib/utils/file-system-utils.ts:15-23 – cache path under `~/.opencode/cache` used for prompt storage.
- test/prompts-opencode-codex.test.ts:82-297 – coverage for caching, TTL, and fetch fallback behavior.

## Definition of Done
1. Update OpenCode prompt fetch logic to use a valid source and avoid 404s.
2. Preserve caching semantics (session + disk + TTL) and existing metrics behavior.
3. Ensure cache warming no longer logs repeated OpenCode fetch errors when network is available.
4. Tests cover the new fetch path/fallback path and continue to pass.

## Requirements
- Add a resilient fetch strategy (e.g., prefer current branch/file path with fallback to legacy path) without breaking existing interfaces.
- Keep cache directory/filenames unchanged to avoid disrupting existing users.
- Maintain log levels (warn on failures) but succeed when a fallback fetch works.
