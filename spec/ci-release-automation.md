# CI + Release Automation Plan

## Summary
- Expand `.github/workflows/ci.yml:1-59` so testing and linting jobs run on every push (any branch) and every PR, add a dedicated mutation-testing job for PRs to `main`, and gate a release job so it only executes after successful pushes to `main`.
- Introduce a lint workflow powered by Biome (add `@biomejs/biome` + `"lint": "biome check ."` in `package.json:30-38` and a project-level `biome.json` config) so the GitHub Action can run `pnpm lint` deterministically.
- Create an `opencode`-powered release analysis tool (`scripts/detect-release-type.mjs`) that summarizes commits since the last tag, calls `https://api.openai.com/v1/responses` with `model: "opencode/gpt-5-nano"`, and emits structured JSON describing breaking changes + release type so the workflow can pick `major|minor|patch` intelligently.
- Build a release job that (1) runs the analyzer, (2) bumps the version via `pnpm version <next>` (letting Git create a tag), (3) publishes to npm using `NPM_TOKEN`, and (4) creates a GitHub Release whose notes embed the analyzer’s output.
- Document CI secrets and npm token setup in a new `docs/development/ci.md`, covering how to set `NPM_TOKEN`, `OPENCODE_API_KEY`, and any optional overrides for the analyzer.

## Requirements / Definition of Done
1. CI workflow runs `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` on every push/PR; mutation testing (Stryker) runs for PRs into `main` (and can be skipped otherwise).
2. Pushes to `main` trigger an automated release job that depends on test+lint success, determines release type via the analyzer, bumps the semver using `pnpm version x.y.z`, pushes the commit/tag, publishes to npm, and opens a GitHub Release summarizing the changes.
3. Analyzer script must use `opencode/gpt-5-nano`, accept `OPENCODE_API_KEY`, gracefully fall back to `patch` when the LLM call fails, and write machine-readable output (JSON) for subsequent steps.
4. Documentation clearly explains how to configure `NPM_TOKEN`, `OPENCODE_API_KEY`, and other required secrets/variables in CI.
5. Mutations job should surface HTML/JSON artifacts (at least uploaded via `actions/upload-artifact`) for manual review when it fails.

## Phases
### Phase 1 – Tooling + Package Updates
- Add `@biomejs/biome` dev dependency + `lint` script in `package.json:30-38`.
- Create `biome.json` with project conventions for lint + formatting.
- Author `scripts/detect-release-type.mjs` that:
  - Discovers the previous tag (fallback: root commit) and collects `git log --no-merges` plus `git diff --stat` summaries.
  - Builds a structured prompt and calls `https://api.openai.com/v1/responses` with `model: "opencode/gpt-5-nano"` using `OPENCODE_API_KEY`.
  - Parses the assistant message (JSON block), falls back to `patch` if parsing fails, computes the next semver, and writes `{ releaseType, nextVersion, summary, breakingChanges }` to stdout/file.

### Phase 2 – Workflow Updates
- Replace `.github/workflows/ci.yml:1-59` triggers with `push` on all branches and `pull_request` on all targets; switch jobs to pnpm; extend with:
  - `lint` job calling `pnpm lint` + `pnpm typecheck`.
  - `test` job running matrix Node versions with `pnpm test` + `pnpm build`.
  - `mutation` job (`if: github.event_name == 'pull_request' && github.base_ref == 'main'`) running `pnpm test:mutation` and uploading Stryker reports.
  - `release` job (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`) that depends on `lint` + `test`, configures git, runs analyzer, bump+tag via `pnpm version`, pushes changes, publishes to npm with `NPM_TOKEN`, and creates GitHub release; feed analyzer output into release body.

### Phase 3 – Documentation & Instructions
- Add `docs/development/ci.md` describing:
  - Required secrets (`NPM_TOKEN`, `OPENCODE_API_KEY`, optional `RELEASE_BASE_REF`).
  - How to generate an npm automation token and store it as `NPM_TOKEN`.
  - How to supply an Opencode API key for the analyzer, plus troubleshooting tips.
  - Overview of workflow behavior (push vs PR vs release) so contributors know when mutation tests run and how automated releases behave.
- Update README or docs index (if needed) to link to the new CI guide.
