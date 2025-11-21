# README cleanup and installation clarity

**Date**: 2025-11-21  
**Owner**: Codex agent  
**Goal**: Make README quieter, surface installation guidance, and move TOS to the bottom.

## Code touchpoints (current line refs)

- `README.md:11-62` — Installation with minimal provider config (plugin + single model + provider options/models) emphasized first.
- `README.md:64-96` — Plugin-Level Settings section surfaced right after installation.
- `README.md:451-522` — Plugin defaults and Configuration Reference intro include minimal provider config subsection (no duplicated plugin-level settings here; points back to top section).
- `README.md:51-68` — Removed non-functional Built-in Codex Commands section.
- `README.md:737-745` — Documentation links reordered above TOS.
- `README.md:747-764` — Terms of Service & Usage Notice relocated near bottom.
- `README.md:770-783` — Auto-generated package doc matrix; must remain untouched.

## Existing issues / PRs

- None found for README noise/installation confusion (quick repository scan; no linked issue/PR identified).

## Definition of done

- TOS/usage notice sits near the end (after FAQs/Docs, before License or similar closing content).
- Clear "Installation" section early that explains prerequisites and setup steps distinct from configuration.
- Configuration content split into digestible pieces (recommended config vs custom/advanced) with concise intros.
- Overall README flow reduces upfront noise while preserving key links and auto-generated matrix.

## Requirements & constraints

- Keep auto-generated `PACKAGE-DOC-MATRIX` block unchanged.
- Preserve existing links and accuracy of configuration examples; adjust anchors if section names change.
- Maintain guidance on ChatGPT subscription and opencode prerequisites.
- Avoid removing critical warnings; relocation is acceptable.

## Plan / phases

1. Draft new top-level outline (Intro, Installation, Key features/commands, Configuration split, Caching, Troubleshooting, Docs, TOS/License).
2. Rewrite README sections to match outline (minimal edits to examples, move TOS near end).
3. Quick pass for clarity/heading consistency and anchor references.

## Changelog

- 2025-11-21: Added Installation section, renamed Configuration Reference, removed standalone requirements block, moved TOS near bottom, and updated related anchors in docs/config README files.
- 2025-11-21: Promoted minimal provider config (plugin array + single `openai/gpt-5.1-codex-max` model with provider/openai options) to top of Installation and Configuration Reference.
- 2025-11-21: Removed non-functional Built-in Codex Commands section pending upstream support.
- 2025-11-21: Surfaced plugin-level settings (codexMode, caching, compaction) immediately after Installation with example JSON.
- 2025-11-21: Removed duplicated plugin-level settings block from Configuration Reference; now it links back to the top settings section.
