# Double plugin config log at startup

## Context
- Opencode startup logs warn twice: `Plugin config file not found, using defaults` for `~/.opencode/openhax-codex-config.json` (first before cache warming, again right after warming completes).
- Likely `loadPluginConfig()` runs multiple times; second invocation happens after caches are warmed, implying loader is called twice while caches are already warm.

## Code references
- `lib/config.ts:25-64` — `loadPluginConfig` reads ~/.opencode/openhax-codex-config.json and logs when missing.
- `index.ts:96-120` — plugin loader calls `loadPluginConfig()` before cache warm logic.
- `lib/utils/file-system-utils.ts:56-62` — `safeReadFile` wrapper used by config loader.

## Known issues / PRs
- No related issues or PRs identified yet.

## Definition of done
- Config file lookup is performed once per process (no duplicate warnings when file is missing).
- Logging keeps first warning/error but does not re-emit on subsequent lookups.
- Tests cover memoized config loading and respect force reload path.

## Requirements / notes
- Preserve current default config behavior and error handling.
- Keep ability to reload config for tests/dev without duplicate logs (e.g., force reload option or reset hook).
- Avoid introducing non-ASCII characters; follow existing logging patterns.
