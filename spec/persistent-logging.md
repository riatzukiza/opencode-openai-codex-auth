# Spec: Persistent Logger Defaults

## Context
Tests emit many console lines because `logRequest`, `logWarn`, and other helpers write directly to stdout/stderr unless `ENABLE_PLUGIN_REQUEST_LOGGING` is disabled. The harness request is to keep test output quiet while still retaining full request telemetry: "Let's just always log to a file both in tests, and in production." Currently `lib/logger.ts` only writes JSON request stages when `ENABLE_PLUGIN_REQUEST_LOGGING=1` (see `logRequest` around lines 47-65). Debug logs are also suppressed unless `DEBUG_CODEX_PLUGIN` is set, which means the only persistent record is console spam. We need a file-first logger that always captures request/response metadata without cluttering unit tests or production stdout.

## References
- Logger implementation: `lib/logger.ts:1-149`
- Logger tests: `test/logger.test.ts:1-132`
- Testing guide (mentions logging expectations): `docs/development/TESTING.md:1-200`

## Requirements / Definition of Done
1. `logRequest` must always persist per-request JSON files under `~/.opencode/logs/codex-plugin/` regardless of env vars, while console output remains opt-in (`ENABLE_PLUGIN_REQUEST_LOGGING` or `DEBUG_CODEX_PLUGIN` to mirror current behavior for stdout).
2. `logDebug`, `logInfo`, `logWarn`, and `logError` should write to a rolling log file (one per session/date is acceptable) *and* continue to emit to stdout/stderr only when the corresponding env var enables it. The file logs should capture level, timestamp, and context to simplify search.
3. Logger tests must cover the new default behavior (file writes happen without env vars, console output stays silent). Add regression coverage for both request-stage JSONs and the new aggregate log file.
4. Documentation (`docs/development/TESTING.md` or README logging section if present) must mention that logs are always written to `~/.opencode/logs/codex-plugin/` and how to enable console mirroring via env vars.
5. Ensure file logging uses ASCII/JSON content and is resilient when directories are missing (auto-create). Console noise in `npm test` should drop as a result.

## Plan
1. Update `lib/logger.ts`: remove `LOGGING_ENABLED` gating for persistence, introduce helper(s) for writing request JSON + append-only log file; gate console emission using env flags. Reuse existing `ensureLogDir()` logic.
2. Extend logger tests to cover default persistence, console gating, and append log behavior. Mock fs to inspect file writes without touching disk.
3. Refresh docs to describe the new always-on file logging and optional console mirrors. Mention location + env toggles for developer reference.
4. Run `npm test` to ensure the quieter logging still passes and the new tests cover the behavior.

## Change Log
- 2025-11-19: Drafted spec for persistent logger defaults per user request.
- 2025-11-19: Implemented always-on file logging, rolling log file, console gating, updated tests, and documentation.
