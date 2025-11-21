# Release PR Flow Adjustment

## Context

- Current workflow `.github/workflows/staging-release-prep.yml` triggers on PR merge into `staging` and directly pushes version bump + tag to `staging` (lines 3-130).
- Branch protection rejects direct pushes to `staging`.
- Hotfix label currently promotes `staging` to `main` when present.

## Plan

1. Update staging release workflow to create a release branch (e.g., `release/vX.Y.Z`) from `staging` and open a PR back to `staging` instead of pushing.
2. Include analyzer outputs (version, notes, hotfix flag) in the PR body and commit message; keep tag creation/publishing out of protected branch writes.
3. Preserve hotfix detection to surface in PR content and enable downstream promotion logic without forcing direct merges.

## Definition of Done

- Workflow no longer attempts `git push origin HEAD:staging` directly; creates a release branch and PR to `staging` instead.
- Version bump commit and release notes are part of the PR branch.
- Hotfix label metadata is preserved in PR content.
- Actions run without violating branch protection.

## Notes

- No related open issues/PRs identified.

## Session Updates

- Converted staging release workflow to use release branches + PRs (staging and hotfix-to-main) instead of direct pushes/tags; added branch name collision safeguard.
