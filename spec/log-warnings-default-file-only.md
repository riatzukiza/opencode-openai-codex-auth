# Log Warnings Default to File

## Context

OpenCode renders console warnings inline, causing severe UI clutter (see reported screenshot). The plugin currently logs warnings to console by default (e.g., personal-use notice in `index.ts:69-73` and other `logWarn` calls), even when request logging/debug flags are off. We need the default behavior to keep warnings out of the UI while still recording them to disk/app logs as appropriate.

## Relevant Files & Pointers

- `lib/logger.ts:12-111` — env defaults and logging flags; `WARN_TOASTS_ENABLED` and console toggles derived here.
- `lib/logger.ts:172-211` — `emit` decides forwarding to app log, toasts, and console (warnings currently mirrored to console by default).
- `lib/logger.ts:284-319` — `logToConsole` behavior; logs warn/error unconditionally.
- `index.ts:66-118` — plugin boot emits personal-use warning via `logWarn` after logger configuration.
- `lib/types.ts:26-39` — `LoggingConfig` fields (currently no toggle for console warnings).
- `test/logger.test.ts:140-229` — expectations for warn behavior (console, toasts) that will need updates.
- `lib/config.ts:12-18` — default config includes `logging.showWarningToasts: false`.

## Existing Issues / PRs

- None identified in repo related to warning display/logging defaults.

## Definition of Done

- Warning logs are not sent to console/UI by default; they are recorded to file/app logs without cluttering the terminal.
- Opt-in mechanism exists to surface warning logs to console/UX when desired.
- Personal-use and other warning emissions follow the new default and do not regress logging reliability.
- Tests updated/added to cover the new default and opt-in paths.

## Requirements

- Default: warnings persist to disk/app logs without console output; errors remain console-visible.
- Provide a config/env switch to re-enable console warnings for debugging or when toasts are desired.
- Preserve existing toast support (`showWarningToasts`) and avoid duplicate surfaces (toast + console).
- Maintain existing log rotation/queue behaviors and non-intrusive behavior in test envs.

## Plan (Phases)

- **Phase 1: Analysis** — Confirm logger state derivations and warning pathways; decide switch shape (config/env) to keep warn off console by default while allowing opt-in.
- **Phase 2: Implementation** — Update logger defaults/emit logic + config schema to make warn-to-console opt-in and ensure file/app logging retains warnings.
- **Phase 3: Validation** — Refresh tests for new defaults and opt-in behavior; run targeted logger suite (and related) to ensure changes pass.
