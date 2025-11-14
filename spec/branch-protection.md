# main Branch Protection

## Summary
- Configure branch protection for `main` so merges require pull requests, include successful `lint` + `test` workflows (typecheck runs inside `lint` job), and prevent direct pushes.
- Currently no branch protection exists (`gh api repos/open-hax/codex/branches/main/protection` returns 404 on 2025-11-14 15:30 UTC).

## Requirements / Definition of Done
1. Enable protection rules via GitHub REST API (or `gh api`) targeting `main` branch.
2. Require pull request reviews before merging (enforce at least 1 approval, disallow bypass via force push/direct push).
3. Require status checks for:
   - `lint` job (covers `pnpm lint` + `pnpm typecheck`).
   - `test (node-version: 20.x)` job.
   - `test (node-version: 22.x)` job.
4. Allow admins to bypass? (Default: include administrators so even admins must follow rules.)
5. Document the rule in `docs/development/ci.md` or similar so contributors know PRs + green checks are mandatory.

## Implementation Plan
### Phase 1 – Prepare data
- Identify workflow/job names (from `.github/workflows/ci.yml`).
- Confirm API payload structure for branch protection (use `required_status_checks` block with contexts).

### Phase 2 – Apply protection
- Use `gh api --method PUT repos/open-hax/codex/branches/main/protection ...` to set rules: require PRs, require code owners? (N/A) but enforce approvals=1, status checks contexts as above.

### Phase 3 – Documentation
- Update `docs/development/ci.md` (or README) with short section describing required checks + PR requirement.
