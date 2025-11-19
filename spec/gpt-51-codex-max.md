# Spec: GPT-5.1-Codex-Max integration

## Context
Issue [open-hax/codex#26](https://github.com/open-hax/codex/issues/26) introduces the new `gpt-5.1-codex-max` model, which replaces `gpt-5.1-codex` as the default Codex surface and adds the "Extra High" (`xhigh`) reasoning effort tier. The current `codex-auth` plugin only normalizes `gpt-5.1`, `gpt-5.1-codex`, and `gpt-5.1-codex-mini` variants (`lib/request/request-transformer.ts:303-426`) and exposes reasoning tiers up to `high` (`lib/types.ts:36-50`, `test/request-transformer.test.ts:15-125`). Documentation (`AGENTS.md:6-111`, `README.md:93-442`, `docs/development/CONFIG_FIELDS.md:288-310`) and bundled configs (`config/full-opencode.json:18-150`, `config/minimal-opencode.json:1-32`) still describe `gpt-5.1-codex` as the flagship choice. We must align with the Codex CLI reference implementation (`codex-cli/codex-rs/common/src/model_presets.rs:53-107`) which already treats `gpt-5.1-codex-max` as the default preset and only exposes the `xhigh` reasoning option for this model.

## References
- Issue: [open-hax/codex#26](https://github.com/open-hax/codex/issues/26)
- Request transformer logic: `lib/request/request-transformer.ts:303-426`, `lib/request/request-transformer.ts:825-955`
- Type definitions: `lib/types.ts:36-50`
- Tests: `test/request-transformer.test.ts:15-1450`
- Docs & config samples: `AGENTS.md:6-111`, `README.md:93-442`, `docs/development/CONFIG_FIELDS.md:288-310`, `config/full-opencode.json:18-150`, `config/minimal-opencode.json:1-32`
- Reference behavior: `codex-cli/codex-rs/common/src/model_presets.rs:53-131` (default reasoning options for Codex Max)

## Requirements / Definition of Done
1. `normalizeModel()` must map `gpt-5.1-codex-max` and all aliases (`gpt51-codex-max`, `codex-max`, `gpt-5-codex-max`, etc.) to the canonical `gpt-5.1-codex-max` slug, prioritizing this match above the existing `gpt-5.1-codex` checks.
2. `ConfigOptions` and `ReasoningConfig` types must allow the new `"xhigh"` reasoning effort, and `getReasoningConfig()` must:
   - Default `gpt-5.1-codex-max` to `medium` effort, mirroring Codex CLI presets.
   - Accept `xhigh` only when the original model maps to `gpt-5.1-codex-max`; other models requesting `xhigh` should gracefully downgrade (e.g., to `high`).
   - Preserve existing clamps for Codex Mini, legacy Codex, and lightweight GPT-5 variants.
3. `transformRequestBody()` must preserve Codex CLI defaults for GPT-5.1-Codex-Max requests (text verbosity `medium`, no parallel tool calls) and continue merging per-model overrides from user config.
4. Automated tests must cover:
   - Normalization of new slug variants.
   - Reasoning clamps/defaults for Codex Max, including `xhigh` acceptance and rejection for other families.
   - `transformRequestBody()` behavior when `reasoningEffort: "xhigh"` is set for Codex Max vs. non-supported models.
5. Documentation and sample configs must describe `gpt-5.1-codex-max` as the new default and explain the `xhigh` reasoning tier where reasoning levels are enumerated.
6. Update change tracking (this spec + final summary) and ensure all tests (`npm test`) pass.

## Plan
1. Update `lib/types.ts` to extend the reasoning effort union with `"xhigh"`, then adjust `normalizeModel()`/`getReasoningConfig()` in `lib/request/request-transformer.ts` for the new slug ordering, default effort, and `xhigh` gate.
2. Enhance `transformRequestBody()` logic/tests to verify reasoning selections involving `gpt-5.1-codex-max`, ensuring Codex models still disable parallel tool calls.
3. Add regression tests in `test/request-transformer.test.ts` (normalization, reasoning, integration) to cover Codex Max inputs and `xhigh` handling.
4. Refresh docs/config samples (`AGENTS.md`, `README.md`, `docs/development/CONFIG_FIELDS.md`, `config/*.json`) to mention Codex Max as the default Codex tier and introduce the `xhigh` effort level.
5. Run the full test suite (`npm test`) and capture results; document completion in this spec's change log and final response.

## Change Log
- 2025-11-19: Initial spec drafted for GPT-5.1-Codex-Max normalization, reasoning, tests, and docs.
- 2025-11-19: Added Codex Max normalization, `xhigh` gating, tests, and documentation/config updates mirroring the Codex CLI rollout.
