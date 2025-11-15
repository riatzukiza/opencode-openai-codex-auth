# Spec: Align Documentation With `@openhax/codex`

## Context & Problem
Multiple documentation sources (README, guides, config samples, troubleshooting scripts, and inline examples) still refer to the plugin as `openhax/codex`. The published package is scoped as `@openhax/codex` (see `package.json:2`). Users copying the outdated instructions cannot install the package via npm, and cleanup commands targeting `node_modules/openhax/codex` fail because scoped packages live under `node_modules/@openhax/codex`.

## References (files & line numbers)
- README.md:3,5 (badges), 79 (plugin array), 542 & 562 (config examples) — use `@openhax/codex` in badges/JSON blocks.
- CONTRIBUTING.md:3 — opening sentence should match the scoped name.
- docs/configuration.md:10,162,183,328 — update sample plugin arrays; ensure surrounding text reflects scope.
- docs/getting-started.md:38,229,286,309 — plugin arrays + local `file:///` example should clarify scoped install path.
- docs/README.md:35 — npm link text/URL needs the scoped package.
- docs/index.md:5 (badge), 60 (cleanup script), 69 (plugin array) — keep consistent with scoped install instructions.
- docs/troubleshooting.md:151 — cleanup command must delete `.cache/opencode/node_modules/@openhax/codex` and sed for `"@openhax\/codex"`.
- docs/development/TESTING.md:12,43,84,119,212,349,451,475 — repeated plugin config blocks and cleanup snippets.
- docs/development/CONFIG_FLOW.md:197,215,251 — plugin array examples.
- docs/development/TESTING.md & docs/troubleshooting scripts share cleanup logic; coordinate updates to avoid divergent instructions.
- config/minimal-opencode.json:3 and config/full-opencode.json:4 — canonical config artifacts must reference the scoped package.
- config/full-opencode.json plus README configuration sections ensure consistent copying.
- index.ts:62 (JSDoc example) — should showcase scoped name for consistency.
- lib/oauth-success.html:551 — UI title referencing the plugin should mention `@openhax/codex` so OAuth screen matches npm identity.

## Related Issues / PRs
- Issue #11 "Docs: Fix package name in test/README.md" overlaps with this task; ensure our updates cover README/test references so the issue can close.
- No open PRs currently address this specific rename (checked `gh pr list --search "openhax/codex"`). PR #8 is unrelated to docs; keep changes isolated from workflow automation work.

## Requirements
1. Replace every documentation/config reference of `openhax/codex` with `@openhax/codex`, including badge URLs (`@` must be URL-encoded) and npm links.
2. Update shell commands manipulating the cache or node_modules path to the scoped structure (`node_modules/@openhax/codex`).
3. Ensure JSON snippets remain valid; remember to escape `@` paths appropriately in sed/regex examples.
4. Keep any existing references that already use the scoped name unchanged (e.g., docs/development/ci.md:88 already correct).
5. After edits, verify markdown and JSON formatting remain intact (no trailing commas, quoting preserved).

## Definition of Done
- All repo-wide occurrences of `openhax/codex` referring to the package name (docs, configs, inline examples) are updated to `@openhax/codex`.
- Badge URLs and npm hyperlinks resolve to `https://www.npmjs.com/package/@openhax/codex`.
- Cleanup scripts and troubleshooting steps correctly reference the scoped module path and sed pattern.
- Inline code examples (README, index.ts, docs) compile/copy without manual fixes.
- Tests/build unaffected (docs-only change), but run `rg "openhax/codex"` to confirm no lingering documentation references remain.

## Plan (Phases)
**Phase 1 – Audit & Scope Confirmation**
- Re-run `rg "openhax/codex"` after each change chunk to ensure only intentional references remain.
- Validate badge/link formats for scoped package syntax (url-encode `@`).

**Phase 2 – Update Documentation & Samples**
- Touch README, docs/README, docs/index, docs/getting-started, docs/configuration, docs/development/* guides, troubleshooting instructions, and config JSON artifacts.
- Adjust shell snippets (sed/rm) for `.cache/opencode/node_modules/@openhax/codex` path.
- Update JSDoc example in `index.ts` and OAuth HTML title for consistency.

**Phase 3 – Verification**
- Run `rg "openhax/codex"` to confirm only intended occurrences remain (e.g., part of strings with `@`).
- Review diff for formatting correctness; no build/test required but ensure JSON remains valid.

## Change Log
- 2025-11-14: Updated README, CONTRIBUTING, docs (index, getting-started, configuration, troubleshooting, developer guides), config templates, scripts, OAuth HTML, and index.ts to reference `@openhax/codex`; cleanup commands now remove `.cache/opencode/node_modules/@openhax/codex` and local dev examples reference the scoped path.
