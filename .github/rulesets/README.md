# GitHub Ruleset Snapshots

These files snapshot the current GitHub repository rulesets as exported via `gh api`. GitHub does not read rules from this directory; updates still need to be applied through the Ruleset UI or API. Keep these files in sync to audit drift.

## Refresh commands

```
GH_TOKEN=<token_with_repo_admin> gh api repos/open-hax/codex/rulesets/10200441 > .github/rulesets/release.json
GH_TOKEN=<token_with_repo_admin> gh api repos/open-hax/codex/rulesets/10223971 > .github/rulesets/main.json
```

After refreshing, commit changes. CI (`.github/workflows/ruleset-drift.yml`) fetches live rulesets, normalizes with `jq -S .`, and diffs against these snapshots; it fails on structural drift.

## Notes

- `release` ruleset applies to the default branch (currently `dev`); strict required checks enforced.
- `main` ruleset applies to `refs/heads/main`; strict_required_status_checks_policy is false.
- If we rename `dev` again, update the default branch and the `release` ruleset target accordingly, then refresh these snapshots.
- CI drift check already fetches live rulesets and diffs against snapshots.
