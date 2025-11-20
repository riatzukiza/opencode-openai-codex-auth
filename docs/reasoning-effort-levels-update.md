# Reasoning Effort Levels Documentation Update

## Summary

Update documentation to clearly explain all available reasoning effort levels for the new Codex Max model, including `none`, `low`, `medium`, `high`, and `xhigh`.

## Current State

Based on codebase analysis:

### Already Implemented ✅
- `xhigh` reasoning effort is supported in code (`lib/types.ts:53`, `lib/request/request-transformer.ts:327`)
- Tests cover `xhigh` handling (`test/request-transformer.test.ts:141-162`)
- README.md mentions `xhigh` for Codex Max (`README.md:453,464,543,548`)
- Configuration files include proper reasoning levels
- AGENTS.md documents `xhigh` exclusivity to Codex Max

### Documentation Gaps Identified
1. README.md could be clearer about the complete range of reasoning levels
2. Need to ensure all reasoning levels (`none`, `low`, `medium`, `high`, `xhigh`) are clearly documented
3. Configuration examples should show the full spectrum

## Files to Update

### Primary Documentation
- `README.md` - Main user-facing documentation
- `docs/development/CONFIG_FIELDS.md` - Developer configuration reference

### Configuration Examples (Already Up-to-Date)
- `config/full-opencode.json` - Complete configuration with all reasoning levels
- `config/minimal-opencode.json` - Minimal configuration

## Definition of Done

- [x] All reasoning effort levels (`none`, `low`, `medium`, `high`, `xhigh`) are clearly documented
- [x] `xhigh` exclusivity to `gpt-5.1-codex-max` is clearly explained
- [x] Automatic downgrade behavior for unsupported models is documented
- [x] Configuration examples show the complete range of reasoning levels
- [x] Documentation is consistent across all files

## Implementation Notes

### Reasoning Effort Levels by Model Type

| Model Type | Supported Levels | Notes |
|------------|----------------|-------|
| `gpt-5.1-codex-max` | `low`, `medium`, `high`, `xhigh` | `xhigh` is exclusive to this model |
| `gpt-5.1-codex` | `low`, `medium`, `high` | `xhigh` auto-downgrades to `high` |
| `gpt-5.1-codex-mini` | `low`, `medium`, `high` | `xhigh` auto-downgrades to `high` |
| `gpt-5.1` (general) | `none`, `low`, `medium`, `high` | `none` only supported on general models |
| `gpt-5-codex` | `low`, `medium`, `high` | `minimal` auto-normalizes to `low` |
| `gpt-5` (legacy) | `minimal`, `low`, `medium`, `high` | `none` auto-normalizes to `minimal` |

### Automatic Normalization Rules

1. **`xhigh` handling**: Only allowed on `gpt-5.1-codex-max`, others downgrade to `high`
2. **`none` handling**: Only supported on GPT-5.1 general models, legacy gpt-5 normalizes to `minimal`
3. **`minimal` handling**: Normalizes to `low` for Codex models (not supported by API)

## Changes Made

### README.md Updates
- Enhanced reasoning effort documentation table
- Added clearer explanation of `xhigh` exclusivity
- Updated model variant descriptions to include reasoning level ranges
- Improved configuration examples section

### CONFIG_FIELDS.md Updates
- Added `xhigh` to the reasoning effort documentation
- Clarified which models support which levels
- Documented automatic normalization behavior

## Testing Verification

All reasoning effort levels are already tested in:
- `test/request-transformer.test.ts:141-162` - `xhigh` handling tests
- `test/request-transformer.test.ts:125-153` - Basic reasoning config tests
- Integration tests cover full configuration flow

## Impact

- **Users**: Clearer understanding of available reasoning levels and model capabilities
- **Developers**: Better documentation for configuration options
- **Support**: Reduced confusion about reasoning effort limitations per model