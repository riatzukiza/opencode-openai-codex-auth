# Refresh access token usage fix

**Date**: 2025-11-19
**Context**: Codex fetch flow is not using refreshed OAuth tokens, causing expired tokens to be sent. Tests indicate `refreshAccessToken` is not effectively invoked in the fetch path.

## Relevant files

- `lib/request/codex-fetcher.ts:44-113` – main Codex fetch flow, token refresh + header assembly
- `lib/request/fetch-helpers.ts:26-80` – `shouldRefreshToken` and `refreshAndUpdateToken` wrapper around `refreshAccessToken`
- `lib/auth/auth.ts:123-167` – `refreshAccessToken` implementation
- Tests: `test/codex-fetcher.test.ts:1-279`, `test/fetch-helpers.test.ts:95-253`

## Existing issues / PRs

- None found linked to this regression.

## Plan (phased)

- **Phase 1: Fix fetcher token handling** – Capture refreshed auth returned from `refreshAndUpdateToken` and use it when building headers so new access token is applied.
- **Phase 2: Tests** – Add/adjust unit coverage to assert refreshed credentials are propagated into request headers (and refresh helper remains exercised).
- **Phase 3: Validation** – Run targeted tests (`test/codex-fetcher.test.ts` + refresh helpers) to ensure refresh flow is exercised and passes.

## Definition of done

- Codex fetch flow uses refreshed credentials after successful refresh; requests no longer use stale access tokens.
- Unit tests cover the refreshed-token path and pass locally.
- No regressions in existing authentication tests.

## Requirements / notes

- Keep behavior unchanged for command short-circuiting and non-OAuth auth (empty tokens still allowed for API key mode).
- Preserve current logging/error handling semantics when refresh fails.
