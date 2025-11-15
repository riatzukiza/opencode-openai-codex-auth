# Main Branch Merge Guard

## Context
We now enforce a release flow where only the `staging` branch may merge into `main`. Any other branch (including hotfixes) must route through `staging`. To prevent accidental PRs directly into `main`, we need an automated guard that fails PRs targeting `main` unless the head branch is `staging`.

## Requirements
1. Add a GitHub Actions workflow that runs on `pull_request` events targeting `main` and fails immediately unless `github.head_ref == 'staging'`.
2. Keep the workflow lightweight (no checkout). The failure message should explain the policy and point contributors to merge via `staging`.
3. Ensure the workflow has `read`-only permissions, since it only validates metadata.
4. Document the rule (if not already) so contributors know why PRs targeting `main` fail.

## Definition of Done
- `.github/workflows/main-merge-guard.yml` exists and enforces the branch policy.
- Workflow exits 0 only when the head branch is `staging`.
- Branch protection references this workflow so merges into `main` require the guard to pass.
- Spec added for traceability.
