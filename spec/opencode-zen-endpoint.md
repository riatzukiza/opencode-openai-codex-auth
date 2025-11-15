# Spec: Default OpenCode Release Analyzer Endpoint

## Context
Issue #9 reports that `scripts/detect-release-type.mjs` incorrectly defaults to the OpenAI responses endpoint. The release analyzer must target the Zen API (`https://opencode.ai/zen/v1/responses`) so that authenticated CI calls reach the managed Opencode service. Current docs (`docs/development/ci.md:33-40`) also describe the wrong default, leading contributors to configure the release workflow incorrectly.

## References
- Issue: [#9](https://github.com/open-hax/codex/issues/9)
- Workflow docs: `docs/development/ci.md:33-44`
- Analyzer: `scripts/detect-release-type.mjs:127-187`
- Related spec: `spec/ci-release-automation.md`

## Requirements / Definition of Done
1. `scripts/detect-release-type.mjs` must default `OPENCODE_API_URL` to `https://opencode.ai/zen/v1/responses` when the env var is unset.
2. `docs/development/ci.md` needs updated prose indicating the Zen endpoint is the automatic default, noting that `OPENCODE_API_URL` is optional for overriding the base URL.
3. Confirm no other files reference the old `https://api.openai.com/v1/responses` default; update if discovered (grep before/after).
4. Document the change in this spec (change log) and summarize in the final response.

## Plan
1. Inspect analyzer script to confirm only the `url` constant needs adjusting (line ~132). Update string and retain env override support.
2. Update CI documentation to describe the Zen default and clarify overriding instructions.
3. Run `rg "api.openai.com/v1/responses"` to ensure no stray references remain.
4. Update this spec with a change log entry.

## Change Log
- 2025-11-15: Switched analyzer default endpoint to `https://opencode.ai/zen/v1/responses` and updated CI docs to describe the Zen base URL.
