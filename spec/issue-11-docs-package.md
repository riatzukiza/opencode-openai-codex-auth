# Spec: Fix package name in `test/README.md`

## Context
- Issue: #11 (Docs: Fix package name in `test/README.md`)
- Repository already references `@openhax/codex` elsewhere, but the test suite description still says "OpenAI Codex OAuth plugin".
- Goal: update the sentence at the top of `test/README.md` so it names the npm package and removes the outdated wording.

## Code Files & References
- `test/README.md` (lines 1-4): change the description from `OpenAI Codex OAuth plugin` to `@openhax/codex, the OpenHax Codex OAuth plugin` to match the npm identity.

## Definition of Done
1. The introductory sentence in `test/README.md` references `@openhax/codex` with the correct branding.
2. No other files are modified.
3. Branch is pushed and PR opened against `staging` to resolve issue #11.

## Requirements
- Preserve the structure and formatting of `test/README.md`.
- Use inline code formatting when referencing `@openhax/codex`.
- Keep the description consistent with the rest of the docs (OpenHax branding).
