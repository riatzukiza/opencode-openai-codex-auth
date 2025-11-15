# Review Comment Automation

## Summary
- Implement an automated workflow triggered by `pull_request_review_comment` creation to run the OpenCode `review-response` agent and produce a branch + PR resolving the feedback.
- Define the `review-response` agent in `.opencode/agent/review-response.md` using Markdown frontmatter (see OpenCode docs `agents`: https://opencode.ai/docs/agents/ ) with model `opencode/big-pickle` and permissions to edit files + run git commands.
- Generate contextual prompt data (review comment, diff hunk, file diff) via a Node helper placed in `scripts/review-response-context.mjs` and hand it to the agent via `opencode run --agent review-response`.
- After the agent applies changes, the workflow must create a branch, commit the results once, push it, and open a PR against the comment’s base branch referencing the original review.
- Provide a `.coderabbit.yaml` tuned to this repository so CodeRabbit reviews align with the automation (docs reference: https://docs.coderabbit.ai/reference/configuration ).

## Current State
- No `.opencode/agent` directory exists (see repo root listing) and no review-specific agent is defined.
- There is no workflow responding to review comments (only `.github/workflows/ci.yml`).
- No `.coderabbit.yaml` is present in the repository root.

## Requirements / Definition of Done
1. `.github/workflows/review-response.yml` (or similar) triggers on `pull_request_review_comment` with `types: [created]`, ignores bot comments, checks out the PR head, installs OpenCode CLI, generates context, runs `opencode run --agent review-response --model opencode/big-pickle`, and if changes exist, creates a new branch + commit + PR targeting the base branch. Workflow must grant `contents: write` and `pull-requests: write` plus supply `OPENCODE_API_KEY` from secrets.
2. `scripts/review-response-context.mjs` reads `$GITHUB_EVENT_PATH`, computes file diff (`git diff base...head -- path`), clamps overly long files/diffs, writes `review-context.md`, and exports metadata (e.g., branch slug) via `$GITHUB_OUTPUT` for downstream steps.
3. `.opencode/agent/review-response.md` contains concise frontmatter describing a subagent with low temperature, editing/bash access, and instructions telling it to:
   - Understand a review comment + diff hunk
   - Modify only the touched file(s)
   - Run targeted tests if specified
   - Produce ready-to-commit changes, leaving branch/commit creation to automation if needed
   - Keep prompts short & deterministic
4. `.coderabbit.yaml` exists in repo root with tailored settings (language EN, assertive profile, auto-review on, path filters to skip generated assets, prefer Biome + Vitest tools, knowledge_base referencing docs). Reference official docs as justification.
5. Documentation updated (e.g., `docs/index.md` or new doc) to mention the new workflow, agent, and CodeRabbit config so contributors know how review comments trigger automations and how to configure required secrets.

## Implementation Plan

### Phase 1 – Agent & Config Assets
- Create `.opencode/agent/review-response.md` with frontmatter fields: description, mode=subagent, model=opencode/big-pickle, temperature ~0.1, tools enabling bash/write/edit, permission for git/binaries. Content: concise checklist for responding to review comments, referencing branch naming pattern `review/comment-<ID>` and requiring single commit.
- Add `.coderabbit.yaml` with: `language: en-US`, `reviews.profile: assertive`, `reviews.auto_review.enabled: true`, enable lint tools `eslint`, `biome`, `gitleaks`, set `knowledge_base.code_guidelines.filePatterns` to scan `docs/**`, and include comment referencing docs.

### Phase 2 – Workflow + Helper Scripts
- Author `scripts/review-response-context.mjs` to parse event, compute diffs (`git diff base..head -- path` + `git show head:path`), truncate to manageable byte length, and write `review-context.md`. Set outputs for `branch_name`, `base_ref`, `pr_number`, etc.
- Add GH workflow `.github/workflows/review-response.yml` with steps:
  - Trigger: `pull_request_review_comment` created (skip bots).
  - Checkout PR head (fetch-depth 0).
  - Setup Node 22.
  - Install pnpm + dependencies if needed? (only Node + script).
  - Install OpenCode CLI via `npm install -g opencode` (and add the npm global bin dir to `PATH`).
  - Run context script; capture outputs.
  - Execute `opencode run --agent review-response --model opencode/big-pickle --file review-context.md "Follow the instructions in review-context.md"` with env `OPENCODE_API_KEY` and `GITHUB_TOKEN`.
  - If git diff exists, create branch `review/comment-${{ steps.context.outputs.comment_id }}` (append timestamp if collision), commit with message referencing comment + PR, push, and `gh pr create --base base_ref --head branch --title ... --body ...` (GH_TOKEN env). Ensure job gracefully exits if no changes.

### Phase 3 – Docs & Guidance
- Update `docs/development/ci.md` (or new doc) with a section describing the review-comment automation, required secrets (`OPENCODE_API_KEY`), and branch naming convention.
- Optionally update `README.md` badges/sections to mention `.coderabbit.yaml` and the auto-fix workflow.

## Definition of Done Checklist
- [ ] Agent file created + linted (Biome) + instructions verified.
- [ ] `.coderabbit.yaml` committed with doc references in comments.
- [ ] Workflow green in `act` or at least `actionlint` passes (include gating?).
- [ ] Scripts added and covered by `pnpm lint` (Biome).
- [ ] Doc updates included.
- [ ] Secrets + env documented for users.
