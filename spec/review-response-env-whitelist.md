# Review Response Env Whitelist Fix

## Context

- `.github/workflows/review-response.yml:9` – workflow load failed with `Unrecognized named-value: 'env'` because the job-level condition referenced `env.REVIEW_RESPONDER_WHITELIST`.

## Existing Issues / PRs

- None known; reported by workflow syntax validation.

## Requirements / Definition of Done

- Job condition avoids unsupported `env` context and passes validation.
- Whitelist still restricts execution to trusted reviewers plus OWNER/MEMBER/COLLABORATOR associations.
- Workflow remains syntactically valid and behavior unchanged otherwise.

## Plan

### Phase 1 – Confirm Failure Source

1. Inspect `.github/workflows/review-response.yml` around the job condition. (Completed)

### Phase 2 – Implement Fix

1. Replace the failing `env` reference with a literal allowlist using `fromJson` that the expression engine supports at job scope.
2. Keep the OWNER/MEMBER/COLLABORATOR checks intact.

### Phase 3 – Validate

1. Re-read the workflow to ensure expression correctness and YAML structure.
2. Optionally run `actionlint` if available.
3. Summarize changes and advise rerunning the workflow.
