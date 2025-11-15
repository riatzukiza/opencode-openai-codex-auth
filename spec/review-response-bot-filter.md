# Review Response Bot Filter Fix

## Context
Issue #10 reports that `.github/workflows/review-response.yml` filters out bot comments by checking `github.event.comment.user.type != 'Bot'`. The workflow is meant to trigger when CodeRabbit (bot) leaves review comments, so the condition is reversed and prevents the automation from running.

## Requirements
1. Update the workflow `if:` condition to _allow_ CodeRabbit bot comments. Either check explicitly for `coderabbitai` or for `user.type == 'Bot'`. The issue description prefers matching the login to prevent other bots from firing the workflow.
2. Ensure we still ignore other commenters (human reviewers, other bots) so we do not spam the workflow.
3. Document the change in the spec and final PR summary.

## Plan
1. Modify `.github/workflows/review-response.yml:9` so the job runs only when `github.event.comment.user.login == 'coderabbitai'`. 
2. Leave other workflow steps untouched.
3. No additional tests available, but we can run `act` manually if needed (not required here). We'll rely on workflow linting.

## Definition of Done
- Workflow triggers only when the review comment author is `coderabbitai`.
- No regressions to the rest of the automation.
- Issue #10 can be closed once merged.
