# Staging-First Release Workflow

## Context
We want releases to flow through `staging` before reaching `main`:
- All feature branches (`feature/*`, `fix/*`, etc.) open PRs into `staging`.
- Successful merges into `staging` should bump the package version and create a git tag.
- Only merges from `staging` → `main` are allowed; `main` never receives direct commits from feature branches.
- Publishing to npm (and GitHub Releases) happens only when the `staging` → `main` deployment occurs **unless** the branch → `staging` PR carried a `hotfix` label. Hotfix PRs should release immediately after their merge.

## Requirements
1. **Branch topology**
   - `staging` is the integration branch; `main` mirrors production.
   - Branch protection should require PRs for `staging` (from feature branches) and `main` (from `staging`).
2. **Version bump automation**
   - Every merged PR into `staging` triggers a workflow that:
     - Computes the next semver via the analyzer (`scripts/detect-release-type.mjs`).
     - Runs `pnpm version <next>` to update package files.
     - Commits the bump back to `staging` (e.g., `chore: release vX.Y.Z`).
     - Tags the commit (`vX.Y.Z`) and pushes tag + branch.
3. **Release gating**
   - The existing release workflow should publish **only** when commits land on `main`.
   - Normal flow: humans open a PR from `staging` → `main` to deploy. After merge, the release workflow publishes using the already bumped version/tag.
4. **Hotfix fast path**
   - If a PR merged into `staging` had the `hotfix` label, a workflow should automatically fast-forward `staging` → `main` (or open/merge a PR automatically) and trigger the release immediately.
   - This allows urgent fixes without waiting for the usual batched deployment.
5. **Traceability**
   - Each automated bump/release should include commit messages referencing the originating PR/label for auditability.

## Proposed Workflow Architecture

### 1. `staging-bump.yml` (new workflow)
- **Trigger**: `pull_request` with `types: [closed]`, `base: staging`, `branches-ignore: ['main']`.
- **Guards**: Run only when `github.event.pull_request.merged == true`.
- **Steps**:
  1. Checkout `staging` at the merge commit (`ref: staging`).
  2. Install pnpm deps + OpenCode CLI.
  3. Run analyzer to compute `{ releaseType, nextVersion, notes }`.
  4. Run `pnpm version $nextVersion` (this creates a commit + tag locally).
  5. Amend commit message to `chore: release v$nextVersion` (include PR number & labels in body).
  6. Push branch + tag (`git push origin staging` + `git push origin v$nextVersion`).
  7. If the merged PR carried the `hotfix` label, set an output `hotfix=true`.
  8. Upload the analyzer notes as an artifact for the deploy workflow (optional).

### 2. `hotfix-auto-merge.yml` (optional new workflow)
- **Trigger**: `workflow_run` from `staging-bump.yml` when `hotfix=true`.
- **Steps**:
  1. Ensure `staging` is ahead of `main` by exactly one release commit.
  2. Fast-forward `main` to `staging` (`git fetch origin`, `git checkout main`, `git merge --ff-only origin/staging`).
  3. Push `main`.
  4. Optionally comment on the PR indicating an automatic release occurred.
  - Alternative: create a PR `hotfix/<version>` → `main`, auto-approve & merge.

### 3. Existing `release` job adjustments
- Narrow trigger to `push` on `main` **only when** the commit message starts with `chore: release v` (use `if: startsWith(github.event.head_commit.message, 'chore: release v')`).
- Remove `pnpm version` and `git push` steps; the version bump already happened on `staging`.
- Instead, read `package.json` version (or reuse the analyzer artifact via `actions/download-artifact` referencing the same tag) and publish/tag accordingly (the tag already exists, so the workflow can skip `git tag`).

## Hotfix Label Detection
- During `staging-bump.yml`, inspect the closed PR via the GitHub API:
  ```bash
  HOTFIX_LABEL=$(gh pr view ${GITHUB_EVENT_PULL_REQUEST_NUMBER} --json labels --jq '.labels[].name' | grep -i '^hotfix$' || true)
  ```
- Set an output `echo "hotfix=$([[ -n "$HOTFIX_LABEL" ]] && echo true || echo false)" >> "$GITHUB_OUTPUT"`.
- Downstream workflows can act on `steps.bump.outputs.hotfix == 'true'`.

## Definition of Done
- New workflow bumping versions on `staging` merges, with commits/tags pushed back to `staging`.
- Release workflow publishes only for commits described above (no direct version edits on `main`).
- Hotfix-labeled PRs automatically promote `staging` to `main` and trigger an immediate release.
- Documentation (README or `docs/development/ci.md`) updated to describe branch policy and hotfix behavior.
