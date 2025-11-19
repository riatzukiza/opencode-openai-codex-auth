# Logging rotation & async I/O spec

## Context
- Rolling log currently uses `appendFileSync` and never rotates, so `codex-plugin.log` can grow without bound in long-running processes.
- Request stage files are persisted synchronously via `writeFileSync`, and rolling log writes occur on every emit, blocking the event loop.

## Relevant files
- `lib/logger.ts`: append path setup and sync writes (`appendFileSync` in `appendRollingLog`, `writeFileSync` in `persistRequestStage`) — lines ~1-185.
- `lib/utils/file-system-utils.ts`: directory helpers (`ensureDirectory`, `safeWriteFile`) — lines ~1-77.
- `test/logger.test.ts`: expectations around sync writes/console behavior — lines ~1-113.
- `test/prompts-codex.test.ts`, `test/prompts-opencode-codex.test.ts`, `test/plugin-config.test.ts`: mock `appendFileSync` hooks that may need updates — see rg results.

## Existing issues / PRs
- No open issues specifically about logging/rotation (checked `gh issue list`).
- Open PR #27 `feat/gpt-5.1-codex-max support with xhigh reasoning and persistent logging` on this branch; ensure changes stay compatible.

## Definition of done
- Rolling log writes are asynchronous and buffered; synchronous hot-path blocking is removed.
- Log rotation enforced with configurable max size and retention of N files; old logs cleaned when limits hit.
- Write queue handles overflow gracefully (drops oldest or rate-limits) without crashing the process and surfaces a warning.
- Tests updated/added for new behavior; existing suites pass.
- Documentation/config defaults captured if new env/config options are introduced.

## Requirements & approach sketch
- Introduce rotation settings (e.g., max bytes, max files) with reasonable defaults and env overrides.
- Implement a buffered async writer for the rolling log with sequential flushing to avoid contention and ensure ordering.
- On rotation trigger, rename current log with sequential suffix and prune files beyond retention.
- Define queue max length; on overflow, drop oldest buffered entries and emit a warning once per overflow window to avoid log storms.
- Keep request-stage JSON persistence working; consider leaving synchronous writes since they are occasional, but ensure they respect new directory management.
- Update tests/mocks to reflect async writer and rotation behavior.
