# Review Response Bot Filter Fix

## Context
Issue #10 reports that `.github/workflows/review-response.yml` filters out bot comments by checking `github.event.comment.user.type != 'Bot'`. The intent is to run the automation for CodeRabbit (bot) and for maintainers reviewing PRs, while ignoring review comments from external contributors.

## Requirements
1. Update the workflow `if:` condition so the job runs when:
   - The comment author login is `coderabbitai`, **or**
   - The comment author belongs to the maintainer whitelist (e.g., `riatzukiza`, `coderabbitai`, `open-hax-maintainers` members).
2. Encode the maintainer list in one place (YAML env or separate JSON) to avoid scattering logins throughout the workflow.
3. Continue ignoring other commenters so random PR authors cannot trigger the automation.
4. Document the change in `docs`/spec and final PR summary.

## Plan
1. Introduce a small script or inline step to check whether `github.event.comment.user.login` is in a `MAINTAINERS` list. Simplest approach: store a comma-separated list in an env var and use a shell condition in the job `if`.
2. Update the job condition to call an expression (or set an output) that returns true when login matches `coderabbitai` or a maintainer.
3. Update `spec/review-response-bot-filter.md` with the new rule.
4. (Optional) Document the maintainer list in `docs/`.

## Definition of Done
- Workflow triggers for CodeRabbit comments and maintainer logins while skipping strangers.
- Maintainer list is easy to update.
- Spec updated; PR references issue #10.
