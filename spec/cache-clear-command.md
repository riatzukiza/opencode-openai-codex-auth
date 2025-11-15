# Cache Clear Command Spec

## Context
Add an npm script that wipes the plugin's cached Codex/OpenCode prompt files stored under `~/.opencode/cache/`. This gives developers a one-liner to reset the cached bridge prompts when debugging.

## Code References
- `package.json:30-40` – existing npm scripts block where the cache-clear command will live.
- `lib/utils/file-system-utils.ts:15-24` – defines `~/.opencode` base path helpers (cache directory location reference).
- `lib/utils/cache-config.ts:16-35` – enumerates cache subdirectories and file names that should be deleted by the command.

## Existing Issues / PRs
- Open issues (`gh issue list --limit 5` on 2025-11-14): #11, #10, #9, #7, #6 – none cover cache clearing.
- Open PRs (`gh pr list --limit 5` on 2025-11-14): #12 – unrelated to cache clearing.

## Requirements
1. Provide an npm script (e.g., `cache:clear`) that deletes the Codex plugin cache files located in `~/.opencode/cache/`.
2. Script must succeed even if files/directories do not exist.
3. Limit deletions to known cache artifacts (`codex-instructions*`, `opencode-codex*`) to avoid removing unrelated user files under `~/.opencode`.
4. Should work cross-platform where possible; rely on Node to execute (use `node -e` with fs APIs instead of shell-specific commands).

## Definition of Done
- `npm run cache:clear` completes without throwing when cache files are missing or present.
- Verified manually by running the script locally (no automated tests required for npm script addition).
- Documentation/spec updated (this file) describing the change.

## Plan
### Phase 1 – Implementation
- Extend `package.json` scripts adding `cache:clear` that runs a Node inline script: resolves `os.homedir() + '/.opencode/cache'` and deletes the cache files defined in `lib/utils/cache-config.ts`.
- Ensure script logs which files were removed / skipped for visibility.

### Phase 2 – Verification
- Execute `npm run cache:clear` locally to ensure it exits cleanly when cache files are absent.
- Update todo list (plan complete) and mark verification step accordingly.
