# Append Env Context Config

## Scope

- Add `appendEnvContext` to plugin config with default derived from `CODEX_APPEND_ENV_CONTEXT`.
- Route env/file tail reattachment through config/options instead of global env in transforms.
- Make tests explicit about env-tail behavior to avoid leaked env state.

## Touched Files

- lib/types.ts (PluginConfig additions)
- lib/config.ts (default config from env, merge logic)
- lib/request/request-transformer.ts (options-driven appendEnvContext handling)
- lib/request/fetch-helpers.ts (propagate config to transform)
- test/request-transformer.test.ts (explicit appendEnvContext expectations)
- test/cache-e2e.test.ts (pass plugin config with appendEnvContext=false)
- test/plugin-config.test.ts (cover env default + overrides, reset env)

## Definition of Done

- appendEnvContext configurable via config file with default from env.
- Transform respects config-driven appendEnvContext; no hard env dependency in tests.
- Cache/request-transformer tests pass with explicit config; plugin config tests cover new field.
- pnpm test test/cache-e2e.test.ts test/request-transformer.test.ts test/plugin-config.test.ts succeeds.

## Notes

- No existing issues/PRs linked for this change.
- Defaults recalc on load; `forceReload` picks up env changes.
