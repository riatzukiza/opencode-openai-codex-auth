# Review-response workflow token alignment

## Context

- File: .github/workflows/review-response.yml (lines 1-106)
- Behavior: Responds to PR review comments; checks out PR head and pushes auto-fix branch using default GITHUB_TOKEN.
- Issue: Org policy blocks PR creation/push via default `GITHUB_TOKEN`; dev-release-prep uses `PR_AUTOMATION_TOKEN` validated explicitly.
- Existing related workflow: .github/workflows/dev-release-prep.yml uses `PR_AUTOMATION_TOKEN` for PR creation and validates secret.

## Requirements / Definition of Done

- review-response workflow uses `secrets.PR_AUTOMATION_TOKEN` for all GitHub write operations (push, PR creation, gh api/cli) instead of default GITHUB_TOKEN.
- Validate presence of PR_AUTOMATION_TOKEN early with a failure message mirroring dev-release-prep wording.
- Keep OPENCODE_API_KEY handling unchanged.
- Ensure checkout/push/pr steps reference the new token via env (GH_TOKEN and git auth) so branch push + PR creation succeed under org policy.
- Review-response branches should be named `review/<base>-<review-id>`.
- Release automation should treat `review/*` branches as non-release and avoid version bumps.
- Tests/build unaffected (workflow-only change).

## Open Questions / Notes

- No other review-response workflows present.
- PAT must have repo permissions; assumes secret already configured in repo/org.
- Checkout of fork PRs may still require permission; pushing uses PAT.
