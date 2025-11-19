# Plugin name rename to npm package name

## Context
- Update plugin/service identifier to use the npm package name `openhax/codex`.

## Relevant code
- lib/constants.ts:7 exports `PLUGIN_NAME` that is used for logging.
- test/constants.test.ts:18-21 asserts the current plugin identity string.

## Tasks / Plan
1. Change `PLUGIN_NAME` to `openhax/codex` in `lib/constants.ts`.
2. Update tests and any string expectations to the new identifier.
3. Keep docs/examples consistent if they explicitly show the service name.

## Definition of done
- Plugin logs use `openhax/codex` as the service name.
- Tests updated to match the new identifier and pass locally if run.
- No references to the legacy identifier remain in code/tests relevant to logging.
