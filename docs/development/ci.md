# CI, Mutation Testing, and Release Automation

Our single workflow (`.github/workflows/ci.yml`) now owns every automated quality and release check. This file describes what runs, how to configure required secrets, and how to troubleshoot the new tooling.

## Pipeline Overview

| Job | When it runs | What it does |
| --- | --- | --- |
| `lint` | every push + PR | Installs dependencies with pnpm, runs `pnpm lint` (Biome) and `pnpm typecheck` (TS strict mode) |
| `test` | every push + PR (Node 20.x + 22.x) | Executes `pnpm test` and `pnpm run build` to catch regressions on both supported runtimes |
| `mutation` | pull requests targeting `main` | Runs `pnpm test:mutation` (Stryker). HTML/JSON reports are uploaded even on failure for review |
| `release` | push events on `main` (after lint+test pass) | Calls the Opencode-powered analyzer, bumps the semver via `pnpm version <x.y.z>`, publishes to npm, and creates a GitHub Release |

### Release Flow Recap
1. A merge into `main` triggers the workflow.
2. The analyzer (`scripts/detect-release-type.mjs`) gathers commits since the last tag, calls `opencode/gpt-5-nano`, and emits structured JSON (release type, reasoning, highlights, breaking changes, Markdown notes). This script now shells out to the OpenCode CLI, so the workflow installs `opencode` globally (`npm install -g opencode`) before invoking it.
3. `pnpm version <nextVersion>` bumps `package.json` / `pnpm-lock.yaml` and creates the git tag expected by npm + GitHub Releases.
4. The job pushes the commit + tag, runs `pnpm run build`, publishes to npm, and then uses `softprops/action-gh-release` so the GitHub release body matches the analyzer output.

## Required Secrets

Add these repository secrets before enabling the workflow:

### `NPM_TOKEN`
Automation token used for publishing. Create one from the npm web UI:
1. Visit <https://www.npmjs.com/settings/<your-account>/tokens>.
2. Choose **Generate New Token → Automation**.
3. Copy the token value and add it as the `NPM_TOKEN` repository secret.

GitHub Actions writes the token into `~/.npmrc` before running `pnpm publish --access public`.

### `OPENCODE_API_KEY`
API key for calling Opencode's Responses endpoint with the `opencode/gpt-5-nano` model. Generate a key with the OpenCode CLI:
```bash
# Create a long-lived key for CI usage
opencode auth token create --label "ci-release" --scopes responses.create
# Copy the token and store it as the OPENCODE_API_KEY secret
```
If you run a self-hosted Opencode endpoint, also add `OPENCODE_API_URL` (optional) to override the default `https://opencode.ai/zen/v1/responses` base URL.

### Optional overrides
- `RELEASE_BASE_REF`: force the analyzer to diff from a specific tag/commit (useful when backporting release branches).

## Branch protection
- `main` requires pull requests for all changes; direct pushes and force pushes are disabled.
- Required status checks: `Lint & Typecheck`, `Test (20.x)`, and `Test (22.x)` must pass before the merge button unlocks. These names mirror the workflow job `name` fields, so keep them in sync whenever CI definitions change. (Type checking runs inside the `Lint & Typecheck` job.)
- No human approvals are required right now—the PR gate exists for automated reviewers and CI visibility.
- Branches must be up to date with `main` before merging because strict status checks are enabled.

## Review comment automation
- Workflow: `.github/workflows/review-response.yml`
- Trigger: every `pull_request_review_comment` with action `created` (non-bot authors only).
- Flow: check out the PR head, generate `review-context.md`, run the `review-response` agent (`.opencode/agent/review-response.md`) with `opencode/big-pickle`, then create a branch named `review/comment-<id>-<run>` containing a single commit. The workflow pushes the branch and opens a PR back to the review’s base branch referencing the original comment.
- Requirements: `OPENCODE_API_KEY` secret (shared with release automation) and default `GITHUB_TOKEN` permissions (`contents: write`, `pull-requests: write`).
- To test locally: `act pull_request_review_comment --eventpath event.json -j auto-review-response` after installing [act](https://github.com/nektos/act) and exporting the required secrets.

### Syncing secrets with `gh`
Instead of copying values into the GitHub UI, you can push local environment variables straight to repository secrets with the helper script:
```bash
# export whichever secrets you want to sync
export NPM_TOKEN=...  # npm automation token
export OPENCODE_API_KEY=...  # CLI token from `opencode auth token create`

# dry-run first (recommended)
pnpm sync:secrets -- --dry-run

# actually sync to this repo
pnpm sync:secrets

# sync to another repo, sending a custom set of secrets
pnpm sync:secrets -- --repo my-org/another-repo NPM_TOKEN OPENCODE_API_KEY RELEASE_BASE_REF
```
Requirements:
1. `gh` CLI installed and authenticated (`gh auth login`).
2. Local env vars exported for every secret you plan to send (optional ones are skipped automatically when unset).
3. Appropriate permissions for the destination repository; otherwise `gh secret set` will fail.

## Local Analyzer Usage
You can run the same analyzer locally to preview the next release type:
```bash
OPENCODE_API_KEY=... node scripts/detect-release-type.mjs --output ./release-analysis.json
cat release-analysis.json
```
Environment variables (e.g., `RELEASE_BASE_REF`) behave exactly like they do in CI.

## Troubleshooting
- **Analyzer falls back to patch:** the script logs the precise reason to stderr. Check that `OPENCODE_API_KEY` is valid, the model endpoint is reachable, and that the OpenCode CLI is installed/accessible (`opencode --version`).
- **npm publish fails (403):** confirm the `NPM_TOKEN` secret exists, has automation scope, and the account owns the `@openhax/codex` package.
- **Mutation job is slow:** it intentionally runs only for PRs targeting `main`. Local developers can reproduce with `pnpm test:mutation` before pushing.

## References
- Workflow: `.github/workflows/ci.yml`
- Analyzer: `scripts/detect-release-type.mjs`
- Lint config: `biome.json`
