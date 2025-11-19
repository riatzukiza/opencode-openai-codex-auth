# Lint Workflow Warning Handling

## Code References

- `.github/workflows/ci.yml:10-36` — Defines the `lint` job (Checkout → pnpm install → `pnpm lint` → `pnpm typecheck`). Currently, any non-zero exit code in the lint step stops the job and fails the workflow.
- `package.json:31-36` — `lint` script executes `eslint .` followed by `prettier --check`, so warnings from ESLint/Prettier can surface during CI.

## Existing Issues / PRs

- No open GitHub issues or PRs in this repository mention the lint workflow warning behavior.

## Requirements

1. GitHub Actions workflow must continue running even when the lint command reports warnings (i.e., lint warnings should not produce a failing status for the workflow).
2. Actual lint errors should still be visible to maintainers through logs/annotations even if the workflow does not fail on warnings.
3. Type checking and other CI jobs must remain unchanged.

## Definition of Done

- Lint job completes with a `success` status even if lint produces warnings, so dependent jobs (tests, release) are not blocked by warning-level issues.
- Lint logs remain accessible so contributors can see and address warnings.
- GitHub workflow syntax validated (e.g., via `act`/YAML linter or manual review) to ensure no syntax regressions.

## Implementation Plan

1. Update `.github/workflows/ci.yml` to mark the "Run lint" step with `continue-on-error: true` so the job records warnings without failing subsequent steps.
2. Give the lint step an `id` that subsequent steps can reference.
3. Add a final guard step that runs after typechecking and explicitly fails the job when `steps.lint.outcome == 'failure'`, ensuring legitimate lint errors still stop the workflow.
4. Leave the `Run typecheck` step unchanged so type errors still fail the workflow.
