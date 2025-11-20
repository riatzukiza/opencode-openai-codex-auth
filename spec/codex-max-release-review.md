# Codex Max release review

## Scope and links
- Branch: `chore/codex-max-release-review`
- Modified code/docs under review:
  - README.md: reasoning-effort table and `xhigh` notes (approx. lines 450-551, 540-548)
  - docs/development/CONFIG_FIELDS.md: reasoningEffort notes (lines ~305-312)
  - lib/config.ts: memoized config loader and forceReload flag (lines 19-61)
  - lib/request/request-transformer.ts: bridge reapplication logic (lines 608-665) and fallback prompt_cache_key logging (lines 1020-1053)
  - test/plugin-config.test.ts: forceReload usage + memoization test (lines ~47-146)
  - test/request-transformer.test.ts: bridge persistence + cache key log level (lines ~629-690, 742-914)
- Related specs: `spec/double-config-log.md`, `spec/session-prefix-mismatch.md`
- Existing issues/PRs: none identified specific to these changes.

## Definition of done
- Config loader warns only on first miss and caches the merged config; force reload remains available for tests/dev.
- Bridge prompt stays injected across session turns so SessionManager no longer reports prefix mismatches and prompt_cache_key stays stable.
- Fallback prompt_cache_key logging downgrades to info when session context is absent; tests cover info vs warn path.
- Documentation clearly lists reasoning effort levels and `xhigh` exclusivity for Codex Max.
- All updated tests pass locally.

## Requirements and considerations
- Preserve default config behavior and error handling; avoid duplicate filesystem reads when cached.
- Keep bridge and prompt cache behavior backward compatible aside from stability/log-level fixes.
- Ensure tests cover regression scenarios (bridge persistence, fallback logging, config memoization) without adding flakiness.
- Maintain ASCII content and existing logging styles.
