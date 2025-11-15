# main Branch Protection

## Summary
- Configure branch protection for `main` so merges require pull requests, include successful `lint` + `test` workflows (typecheck runs inside `lint` job), and prevent direct pushes.
- Currently no branch protection exists (`gh api repos/open-hax/codex/branches/main/protection` returns 404 on 2025-11-14 15:30 UTC).

## Requirements / Definition of Done
1. Enable protection rules via GitHub REST API (or `gh api`) targeting `main` branch.
2. Require pull request reviews before merging (enforce at least 1 approval, disallow bypass via force push/direct push).
3. Require status checks for:
   - `Lint & Typecheck` job (covers `pnpm lint` + `pnpm typecheck`).
   - `Test (20.x)` job.
   - `Test (22.x)` job.
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

## Follow-Up: Wrong Job Contexts (2025-11-15)
- Prior to this fix the protection settings required contexts `lint`, `test (node-version: 20.x)`, `test (node-version: 22.x)`.
- Actual GitHub check names (from `gh run view 19381469238 --json jobs`) are `Lint & Typecheck`, `Test (20.x)`, `Test (22.x)`.
- Result: branch protection never saw matching checks, so merges into `main` could proceed without real gating.

### Remediation Steps
1. Update branch protection via `gh api` (PUT) so `required_status_checks.checks` includes:
   - `{ context: "Lint & Typecheck" }`
   - `{ context: "Test (20.x)" }`
   - `{ context: "Test (22.x)" }`
2. Keep `strict: true` and `enforce_admins: true`.
3. Document the exact job names in `docs/development/ci.md` and CONTRIBUTING so maintainers know which checks must stay in sync with workflow `name` fields.
4. Optionally add a CI test (or script) that fails if branch protection contexts drift from workflow job names (e.g., script hitting REST API + parsing `.github/workflows/ci.yml`).

