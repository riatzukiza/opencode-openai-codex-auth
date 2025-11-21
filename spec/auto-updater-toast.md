# Auto-update notifier (npm release check)

## Context

Need an auto updater that checks npm for newer plugin releases, removes the existing installed version when an update is available, and surfaces a toast notification informing the user. Current toast plumbing exists in `lib/logger.ts` but no npm update check flow is present.

## Code references

- `lib/logger.ts`:1-195 — logging + toast helper `notifyToast`, wraps messages and calls `tui.showToast` when available.
- `lib/utils/cache-config.ts`: comments note rate limit protection when checking GitHub for updates; may inform similar throttling for npm registry polling.

## Existing issues/PRs

- None identified in repo for npm auto-update or update notifications.

## Definition of done

- Issue opened describing desired auto-update flow: npm registry check for newer version, clearing existing installed version before upgrade, and emitting a user-facing toast when an update is available.
- Issue includes expected behavior, edge cases, and acceptance criteria.

## Requirements / Notes

- Source of truth for version: npm registry package metadata (e.g., `dist-tags.latest`).
- Behavior: compare installed version to registry latest; on newer release, cleanly remove old install (documented approach), then notify via toast (success/info variant) with next steps.
- Include considerations for rate limiting, offline handling, and failure logging.
- Keep toast short; provide fallback logging when TUI unavailable.
