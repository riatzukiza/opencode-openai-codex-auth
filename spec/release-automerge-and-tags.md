# Release workflow: tags + auto-merge + CodeRabbit

## Context
- PR #36 refines the staging release workflow; prior flow failed to push tags and didn’t create PRs against staging/main.
- Release ruleset (ID 10200441) enforces status checks and CodeRabbit on `main` and `staging` (refs include default branch + `refs/heads/staging`).

## Problem
- Need PR-based release flow but still publish annotated tags.
- Release PRs should auto-merge after required checks, CodeRabbit review, and resolved conversations.
- Warn-level logs must continue to reach persistent logs/console while also surfacing as toasts.
- Auto-base workflow must reliably retarget PRs to `staging`.

## Changes
- `.github/workflows/staging-release-prep.yml`: build release branch, tag `v<next_version>`, push branch+tag, open PRs to staging (and main for hotfix), request `coderabbitai` review, and enable auto-merge (squash). Lines ~10-228.
- `.github/workflows/pr-auto-base.yml`: add `contents: read`, capture PR number, include reopened/synchronize triggers, and retarget via `gh pr edit ... --repo` to avoid git context failures. Lines ~3-38.
- `lib/logger.ts`: keep toast notifications but always forward warnings to app logs and console for persistence. Lines ~1-188.

## Definition of Done
- Workflow creates annotated tag `v<next_version>` and pushes it alongside the release branch.
- Release PR to staging (and hotfix PR to main when labeled) is opened, requests CodeRabbit review, and auto-merge is enabled; PR auto-merges only after required checks/reviews/conversation resolution (per GitHub ruleset).
- Warn logs are both toasted and persisted (app log + console) for diagnostics.
- Auto-base workflow successfully retargets PRs to `staging` and does not fail on missing git context.

## Requirements / Notes
- Permissions: `contents: write`, `pull-requests: write` needed for branch/tag pushes, review requests, and auto-merge GraphQL; auto-base uses `contents: read` + `pull-requests: write`.
- Uses `scripts/detect-release-type.mjs` outputs (`nextVersion`, `releaseNotes`).
- Release ruleset already requires CodeRabbit + CI contexts: Lint & Typecheck, Test (20.x/22.x), Test on Node.js 20.x/22.x, CodeRabbit.
