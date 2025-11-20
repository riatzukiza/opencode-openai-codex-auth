# Log Warnings Toasts

## Context

User reports warning text appearing as inline log output in the UI (see screenshot). Expectation: warnings should surface as toasts (if shown at all) rather than cluttering the log stream.

## Relevant Files & Pointers

- `index.ts`:66-75 — schedules Codex personal-use warning via `logWarn` after plugin setup.
- `lib/logger.ts`:65-162 — logger configuration and log emission pipeline; warns currently forwarded to app log/console, toasts only for `error` level.
- `test/logger.test.ts`:121-133 — asserts warnings emit to console; will need update for new behavior.

## Existing Issues / PRs

- None identified yet in repo for warning display/toast handling.

## Plan (Phases)

- **Phase 1: Analysis** — Confirm logger pathways for warnings (app.log, console, toast availability) and identify minimal change to favor toasts over inline log output when TUI exists.
- **Phase 2: Implementation** — Update logger to route warnings to toasts (and avoid noisy UI logging when TUI is available) while retaining diagnostics elsewhere; adjust initial warning emission if needed.
- **Phase 3: Validation** — Update/tests to cover new warn behavior; run targeted test suite for logger to ensure pass.

## Definition of Done

- Warning messages no longer show as inline log spam in the UI; they display as toasts when a TUI is available, or remain non-intrusive otherwise.
- Logging/diagnostics are preserved (file logging/app logging) without surfacing to end users unless toasting.
- Relevant tests updated/added and passing.

## Requirements

- Use toast notifications for warnings when surfaced to users; avoid duplicative inline log output that caused the reported issue.
- Keep logging functionality intact for debugging (disk or app logging), but ensure user-facing presentation is toast-first.
- Maintain compatibility with environments lacking `tui.showToast` (fallback to existing behavior without user-facing spam).
