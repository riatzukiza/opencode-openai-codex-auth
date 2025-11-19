# Lint Workflow Warning Handling

## Code References

- `.github/workflows/ci.yml` — `lint` job installs deps, runs ESLint, and typechecks; new `format` job auto-runs Prettier with write/check phases and commits changes on push events.
- `package.json` — defines discrete scripts for ESLint (`lint:eslint`) and Prettier (`format:write`, `format:check`, aggregated `format`).

## Existing Issues / PRs

- No open GitHub issues or PRs in this repository mention the lint workflow warning behavior.

## Requirements

1. GitHub Actions workflow must continue running even when lint command reports warnings.
2. ESLint errors should still fail linting so maintainers can see blocking issues immediately.
3. Prettier formatting should run in a dedicated workflow/job that attempts to auto-fix files, commits the formatted code back to the branch on push events, and only fails when Prettier cannot fix an issue.
4. Type checking and other CI jobs must remain unchanged.

## Definition of Done

- Lint job completes with a `success` status even if lint produces warnings, so dependent jobs (tests, release) are not blocked by warning-level issues.
- Lint logs remain accessible so contributors can see and address warnings.
- Auto-format job commits Prettier fixes back to the source branch on push events (when necessary) and only fails when a file cannot be formatted.
- GitHub workflow syntax validated (e.g., via `act`/YAML linter or manual review) to ensure no syntax regressions.

## Implementation Plan

1. Split package scripts so ESLint and Prettier have dedicated commands:
   - `lint:eslint` (ESLint only)
   - `format:write` and `format:check` (Prettier write/check)
   - Keep developer-friendly aggregators (`lint`, `lint:fix`) that orchestrate both for local use.
2. Update `.github/workflows/ci.yml` lint job to run `pnpm lint:eslint` (no warning masking) followed by the existing typecheck step. Drop the previous guard logic since ESLint will fail naturally on errors.
3. Add a `format` job to `.github/workflows/ci.yml` that:
   - Runs only on push events (PRs still rely on contributors running Prettier locally).
   - Installs deps, executes `pnpm format:write`, confirms clean state via `pnpm format:check`, and commits/pushes formatting changes automatically when diffs exist.
   - Fails only if Prettier encounters errors it cannot fix (e.g., invalid syntax causing `format:write` or `format:check` to exit non-zero).
4. Document the new workflow expectations in the spec so contributors know Prettier is auto-managed while ESLint remains developer responsibility.
