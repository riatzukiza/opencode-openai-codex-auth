# Review Response Skips (2025-11-20)

## Code references

- .github/workflows/review-response.yml:3-6 trigger `pull_request_review_comment` on comment creation
- .github/workflows/review-response.yml:9 author gate restricts to coderabbitai/riatzukiza/OWNER/MEMBER/COLLABORATOR

## Related issues / PRs

- PR #59 (feat/align-session-fork-ids-23 → dev) merged
- PR #60 (feat/compaction-heuristics-22 → dev) merged
- PR #58 (review/v0.3.5 → dev) merged
- Existing specs: review-response-bot-filter.md, review-response-workflow-fix.md, review-response-automation.md (no open issues checked yet)

## Recent workflow runs (skipped)

| Run ID      | Created (UTC)        | Head branch                    | Actor                    | Conclusion |
| ----------- | -------------------- | ------------------------------ | ------------------------ | ---------- |
| 19554395896 | 2025-11-20T23:17:15Z | feat/align-session-fork-ids-23 | coderabbitai[bot]        | skipped    |
| 19554352983 | 2025-11-20T23:15:09Z | dev                            | coderabbitai[bot]        | skipped    |
| 19554352823 | 2025-11-20T23:15:08Z | dev                            | coderabbitai[bot]        | skipped    |
| 19554352809 | 2025-11-20T23:15:08Z | dev                            | coderabbitai[bot]        | skipped    |
| 19554273398 | 2025-11-20T23:11:19Z | feat/compaction-heuristics-22  | github-code-quality[bot] | skipped    |
| 19554100516 | 2025-11-20T23:03:36Z | feat/align-session-fork-ids-23 | github-code-quality[bot] | skipped    |
| 19554045703 | 2025-11-20T23:01:09Z | review/v0.3.5                  | coderabbitai[bot]        | skipped    |
| 19554045616 | 2025-11-20T23:01:09Z | review/v0.3.5                  | coderabbitai[bot]        | skipped    |
| 19553863858 | 2025-11-20T22:51:44Z | review/v0.3.5                  | coderabbitai[bot]        | skipped    |
| 19553735673 | 2025-11-20T22:45:20Z | review/v0.3.5                  | coderabbitai[bot]        | skipped    |
| 19553592977 | 2025-11-20T22:38:48Z | review/v0.3.5                  | coderabbitai[bot]        | skipped    |
| 19553592903 | 2025-11-20T22:38:47Z | review/v0.3.5                  | coderabbitai[bot]        | skipped    |
| 19553515649 | 2025-11-20T22:35:15Z | review/v0.3.5                  | coderabbitai[bot]        | skipped    |
| 19552788341 | 2025-11-20T22:05:33Z | review/v0.3.5                  | coderabbitai[bot]        | skipped    |
| 19552350292 | 2025-11-20T21:46:45Z | dev                            | coderabbitai[bot]        | skipped    |

## Observations

- All 2025-11-20 runs concluded `skipped` because the job-level `if` gate requires comment authors to be coderabbitai/riatzukiza/org members/collaborators; bot logins such as `coderabbitai[bot]` and `github-code-quality[bot]` fail the check.
- The runs originated from review comments on merged PR branches (#58, #59, #60) plus dev branch comments.

## Definition of done

- Identify the workflow guarding condition, list skipped runs with actors/branches, and map them to PR branches involved in the review comments.

## Requirements

- Confirm skip cause from workflow logic and recent logs.
- Provide PR context for the skipped runs so triggering expectations are clear.
