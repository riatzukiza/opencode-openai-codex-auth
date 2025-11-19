# Changelog

All notable changes to this project are documented here. Dates use the ISO format (YYYY-MM-DD).

## [3.3.0] - 2025-11-19
### Added
- Codex Max support that mirrors the Codex CLI: normalization for every `gpt-5.1-codex-max` alias, `reasoningEffort: "xhigh"`, and unit tests covering both the transformer and request body integration path.
- Documentation and configuration updates calling out Codex Max as the flagship preset, plus refreshed samples showing how to opt into the Extra High reasoning mode.

### Changed
- Sample configs (`full` + `minimal`), README tables, AGENTS.md, and the diagnostics script now prefer `gpt-5.1-codex-max`, keeping plugin defaults aligned with Codex CLI behaviour.

### Fixed
- Requests that specify `reasoningEffort: "xhigh"` for non-supported models are now automatically downgraded to `high`, preventing API errors when Codex Max isn't selected.

## [3.2.0] - 2025-11-13
### Added
- GPT-5.1 family integration: normalization for `gpt-5.1`/`gpt-5.1-codex`/`gpt-5.1-codex-mini`, expanded reasoning heuristics (including `reasoningEffort: "none"`), and preservation of the native `shell`/`apply_patch` tools emitted by Codex CLI.
- Updated configuration, diagnostics script, and docs to showcase the 5.1 lineup (low/medium/high plus `none`) while keeping GPT-5 presets available for backwards compatibility.

### Changed
- Default fallback model now targets `gpt-5.1`, and Codex Mini requests always use the new `gpt-5.1-codex-mini` slug to stay in sync with the latest Codex release.

### Fixed
- Prevented invalid reasoning combinations by clamping unsupported `none`/`minimal` requests on Codex models and ensuring parallel tool-call behavior matches both GPT-5 and GPT-5.1 Codex variants.

## [3.1.0] - 2025-11-11
### Added
- Codex Mini support end-to-end: normalization to the `codex-mini-latest` slug, proper reasoning defaults, and two new presets (`gpt-5-codex-mini-medium` / `gpt-5-codex-mini-high`).
- Documentation & configuration updates describing the Codex Mini tier (200k input / 100k output tokens) plus refreshed totals (11 presets, 160+ unit tests).

### Fixed
- Prevented Codex Mini from inheriting the lightweight (`minimal`) reasoning profile used by `gpt-5-mini`/`nano`, ensuring the API always receives supported effort levels.

## [3.0.0] - 2025-11-04
### Added
- Codex-style usage-limit messaging that mirrors the 5-hour and weekly windows reported by the Codex CLI.
- Documentation guidance noting that OpenCode's context auto-compaction and usage sidebar require the canonical `config/full-opencode.json`.

### Changed
- Prompt caching now relies solely on the host-supplied `prompt_cache_key`; conversation/session headers are forwarded only when OpenCode provides one.
- CODEX_MODE bridge prompt refreshed to the newest Codex CLI release so tool awareness stays in sync.

### Fixed
- Clarified README, docs, and configuration references so the canonical config matches shipped behaviour.
- Pinned `hono` (4.10.4) and `vite` (7.1.12) to resolve upstream security advisories.

## [2.1.2] - 2025-10-12
### Added
- Comprehensive compliance documentation (ToS guidance, security, privacy) and a full user/developer doc set.

### Fixed
- Per-model configuration lookup, stateless multi-turn conversations, case-insensitive model normalization, and GitHub instruction caching.

## [2.1.1] - 2025-10-04
### Fixed
- README cache-clearing snippet now runs in a subshell from the home directory to avoid path issues while removing cached plugin files.

## [2.1.0] - 2025-10-04
### Added
- Enhanced CODEX_MODE bridge prompt with Task tool and MCP awareness plus ETag-backed verification of OpenCode system prompts.

### Changed
- Request transformation made async to support prompt verification caching; AGENTS.md renamed to provide cross-agent guidance.

## [2.0.0] - 2025-10-03
### Added
- Full TypeScript rewrite with strict typing, 123 automated tests, and nine pre-configured model variants matching the Codex CLI.
- CODEX_MODE introduced (enabled by default) with a lightweight bridge prompt and configurability via config file or `CODEX_MODE` env var.

### Changed
- Library reorganized into semantic folders (auth, prompts, request, etc.) and OAuth flow polished with the new success page.

## [1.0.3] - 2025-10-02
### Changed
- Major internal refactor splitting the runtime into focused modules (logger, request/response handlers) and removing legacy debug output.

## [1.0.2] - 2025-10-02
### Added
- ETag-based GitHub caching for Codex instructions and release-tag tracking for more stable prompt updates.

### Fixed
- Default model fallback, text verbosity initialization, and standardized error logging prefixes.

## [1.0.1] - 2025-10-01
### Added
- README clarifications: opencode auto-installs plugins, config locations, and streamlined quick-start instructions.

## [1.0.0] - 2025-10-01
### Added
- Initial production release with ChatGPT Plus/Pro OAuth support, tool remapping, auto-updating Codex instructions, and zero runtime dependencies.
