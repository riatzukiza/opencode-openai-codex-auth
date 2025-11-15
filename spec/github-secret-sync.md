# GitHub Secret Sync Script

## Summary
- Add a CLI helper (Node script) invoked via `pnpm sync:secrets` that pushes locally defined environment variables to GitHub repository secrets using `gh secret set`.
- The script should default to syncing the secrets required by `.github/workflows/ci.yml:3-191` (currently `NPM_TOKEN`, `OPENCODE_API_KEY`, optional `OPENCODE_API_URL`, `RELEASE_BASE_REF`) but allow overriding the list via CLI arguments.
- Documentation (`docs/development/ci.md:22-80`) already explains which secrets are needed; enhance it with instructions for the new helper.

## References
- `.github/workflows/ci.yml:3-191` – defines required CI secrets for release job.
- `docs/development/ci.md:3-80` – describes manual setup steps for `NPM_TOKEN`, `OPENCODE_API_KEY`, and optional overrides.
- `package.json:31-70` – scripts section; add a new `sync:secrets` entry.

## Requirements / Definition of Done
1. `scripts/sync-github-secrets.mjs` (or similar) reads env var names (default list above unless CLI args provided), validates each exists locally, and executes `gh secret set <NAME> --repo <owner/repo> --body-stdin` piping the value. Detect repo from `GITHUB_REPOSITORY` env or `git config --get remote.origin.url` fallback; allow overriding via `--repo my-org/my-repo` flag.
2. Script should fail fast with descriptive errors when:
   - `gh` CLI is missing.
   - `gh secret set` exits non-zero.
   - Required env var is undefined.
3. Add pnpm script alias `sync:secrets: node scripts/sync-github-secrets.mjs` (with pass-through arguments) for easy invocation.
4. Update `docs/development/ci.md` with a short “Syncing Secrets with gh” section showing how to run `pnpm sync:secrets -- --repo open-hax/codex NPM_TOKEN OPENCODE_API_KEY ...` and clarifying prerequisites (logged into GitHub CLI, env vars exported locally).
5. Provide inline comments or usage description inside the script (`--help` output or README snippet) so contributors understand supported flags.
