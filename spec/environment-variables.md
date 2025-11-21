# Environment Variables Audit

## Context

- User requested a list/summary of all environment variables used by this repository.

## Sources (code refs)

- lib/logger.ts:12-27,428-435 (logging flags, rotation tuning via env, generic accessor)
- lib/config.ts:72-76 (CODEX_MODE override)
- scripts/sync-github-secrets.mjs:5-10,63-65,106-114 (default secret names, repo detection, env lookup)
- scripts/review-response-context.mjs:7-10,104-110 (GitHub Actions paths/outputs)
- scripts/detect-release-type.mjs:18-21,30-31 (release base ref/head sha overrides)

## Environment variables and purposes

- `ENABLE_PLUGIN_REQUEST_LOGGING` (`lib/logger.ts:7`): when "1", persist detailed request logs.
- `DEBUG_CODEX_PLUGIN` (`lib/logger.ts:8`): when "1", enable debug logging/console output (unless NODE_ENV=test).
- `NODE_ENV` (`lib/logger.ts:10`): if "test", suppress console logging during tests.
- `CODEX_LOG_MAX_BYTES` (`lib/logger.ts:16`): max rolling log file size before rotation (default 5MB).
- `CODEX_LOG_MAX_FILES` (`lib/logger.ts:17`): how many rotated log files to keep (default 5).
- `CODEX_LOG_QUEUE_MAX` (`lib/logger.ts:18`): max queued log entries before overflow warning (default 1000).
- `CODEX_SHOW_WARNING_TOASTS` (`lib/logger.ts:15`): when "1", allow warning-level toasts (config default keeps them off).
- `CODEX_MODE` (`lib/config.ts:72-76`): if set, overrides config; "1" enables Codex bridge/tool mapping, otherwise disables.
- `GITHUB_REPOSITORY` (`scripts/sync-github-secrets.mjs:63-65`): optional repo inference fallback for syncing secrets.
- `NPM_TOKEN`, `OPENCODE_API_KEY`, `OPENCODE_API_URL`, `RELEASE_BASE_REF` (`scripts/sync-github-secrets.mjs:5-10`): default env names expected when syncing secrets (first two required, latter two optional unless explicitly requested).
- `GITHUB_EVENT_PATH` (`scripts/review-response-context.mjs:7-10`): required path to event payload in review-comment workflow.
- `GITHUB_OUTPUT` (`scripts/review-response-context.mjs:104-110`): optional path to append action outputs.
- `RELEASE_BASE_REF` (`scripts/detect-release-type.mjs:18-21`): optional override for release comparison base.
- `GITHUB_SHA` (`scripts/detect-release-type.mjs:30-31`): optional head sha override (falls back to git rev-parse HEAD).

## Existing issues/PRs

- None identified during this audit.

## Definition of done

- Enumerate all environment variables referenced in code/scripts with locations and purposes; provide user-facing summary.

## Notes

- Secret sync script can read any env name specified via CLI args in addition to defaults; above list reflects defaults plus repo inference variables.
- Logging-related env vars can be overridden in ~/.opencode/openhax-codex-config.json via the `logging` block.
