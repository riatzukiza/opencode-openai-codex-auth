# PR Auto Base Retarget Fix

## Problem

The `pr-auto-base.yml` workflow was failing with the error:

```
failed to run git: fatal: not a git repository (or any of the parent directories): .git
```

This occurred because the workflow was trying to run `gh pr edit` without first checking out the repository, so there was no git context for the GitHub CLI to work with.

## Solution

Updated the workflow to:

1. Add a checkout step using `actions/checkout@v4` with `fetch-depth: 0` to ensure full git history
2. Keep the retarget logic that moves PRs to `staging` unless they already target `staging` or originate from `staging`

## Code References

- `.github/workflows/pr-auto-base.yml`: Checkout step at lines 16-20 ensures a git repository is available for GitHub CLI commands
- `.github/workflows/pr-auto-base.yml`: Retarget logic at lines 22-32 switches PR base to `staging` unless the base is already `staging` or the head branch is `staging`
- `CONTRIBUTING.md`: Pull request process and release process sections clarify `staging` as the default base and describe release automation (lines 49-69)

## Existing Issues / PRs

- No linked GitHub issues or PRs referenced in this change; fix derived from observed workflow failure logs

## Files Changed

- `.github/workflows/pr-auto-base.yml`: Added checkout step before the retarget logic
- `CONTRIBUTING.md`: Clarified PR base branch guidance and documented release process that runs from `staging`

## Definition of Done

- Workflow runs without `fatal: not a git repository` errors
- PRs opened against `main` are automatically retargeted to `staging`, except when they already target `staging` or originate from `staging`
- Contributors are instructed to target `staging` and understand the release pipeline that runs post-merge

## Requirements

- GitHub-hosted runner with `gh` CLI available
- `pull-requests: write` permission granted to the workflow; `GH_TOKEN` sourced from `secrets.GITHUB_TOKEN`
- Repository must be checked out before invoking any `gh pr` commands

## Testing

The workflow should now successfully:

- Check out the repository with full history
- Run the retarget logic in a proper git context
- Successfully retarget PRs from main to staging (except when PR is from staging branch)
