# sst/opencode Console Logging Spec

## Objective
Document how the upstream `sst/opencode` project implements its "new" console logging pipeline so we can borrow the same approach inside this plugin instead of relying on raw `console.log`, which disrupts the CLI/TUI output. The spec focuses on understanding the `Log` namespace, how it is initialized, and how other subsystems (CLI, TUI worker, server, plugins) emit structured log entries that stay out of the primary UI stream unless explicitly requested.

## Code References
- `sst/opencode/packages/opencode/src/util/log.ts:L1-L173` – Core `Log` namespace defining log levels, cached loggers per `service` tag, Bun-based writers (`stderr` vs rotating files under `Global.Path.log`), structured message builder with ISO timestamps + `+<delta>ms`, `tag/clone/time` helpers, and optional `Log.init()` setup for file-only output when `--print-logs` is absent.
- `sst/opencode/packages/opencode/src/index.ts:L27-L118` – CLI bootstrap wires `yargs` middleware that calls `Log.init({ print: argv.includes("--print-logs"), dev: Installation.isLocal(), level: ... })`, sets `Log.Default`, and logs startup metadata so normal command output remains clean.
- `sst/opencode/packages/opencode/src/cli/cmd/tui/worker.ts:L1-L34` – Background TUI worker repeats the same `Log.init` dance so worker-side logs never bleed into the curses UI unless `--print-logs` is set.
- `sst/opencode/packages/opencode/src/global/index.ts:L1-L45` – Defines the `~/.local/share/opencode/log` directory (via `xdgData`) that `Log.init()` writes to; ensures directories exist and rotates cache directories when the cache version changes.
- `sst/opencode/packages/opencode/src/plugin/index.ts:L1-L53` – Example of a subsystem-specific logger (`const log = Log.create({ service: "plugin" })`) that emits structured info (`log.info("loading plugin", { path })`) instead of raw `console.log`.
- `sst/opencode/packages/opencode/src/server/server.ts:L79-L214` – Server initializes its own logger, wraps every Hono request in `log.info` + `log.time` middleware, and skips the `/log` route to avoid recursive logging.
- `sst/opencode/packages/opencode/src/server/server.ts:L1249-L1315` – `/log` endpoint lets plugins/services POST `{ service, level, message, extra }` so the host process writes logs on their behalf using the same formatter.
- `sst/opencode/packages/opencode/src/project/state.ts:L1-L40` and similar modules – Representative usage of `Log.create({ service: "state" })` to stamp subsystem tags and share cached writers.
- External reference: [DEV article on opencode logger](https://dev.to/ramunarasinga-11/logger-in-opencode-codebase-ji2) summarizes namespace design (Log Level enum, logger contract, caching) and points back to the same files above for further details.

## Existing Issues / PRs
- Latest GitHub issues (`gh issue list -L 5 --repo sst/opencode`): #4202 (provider allowlist), #4200 (Gemini edit tool), #4197 (command timeouts), #4196 (chat history snapping), #4195 (Windows pnpm install). None discuss console logging yet, so no upstream blockers to reuse the pattern.
- Recent PRs (`gh pr list -L 5 --repo sst/opencode`): #4204 (task resume flow), #4203 (OpenAI-compatible cache), #4201 (batch bash updates), #4199 (robust edit), #4183 (ollama init). Again, no logging-specific changes pending, so references above are the current state of dev branch (2025-11-11).

## Requirements
1. Capture how `Log.init` chooses between stderr vs rotating files and how log levels/timestamps are formatted so we can mirror the UX.
2. Describe how subsystems obtain scoped loggers via `Log.create({ service })`, reuse them via caching, and enrich entries with `.tag()` and `.time()` helpers.
3. Explain how the CLI/TUI keep stdout clean (default `print=false`) while still offering `--print-logs` for debugging, so plugins can follow the same toggle.
4. Document how external processes can stream logs back to the host using the `/log` HTTP endpoint, giving plugins a path to avoid inline `console.log` altogether.

## Definition of Done
- Written summary of the `Log` namespace covering initialization, writers, log structure, and helper APIs with file+line references.
- Mapping of at least three representative call sites (CLI bootstrap, TUI worker, plugin namespace) showing how they initialize or consume the logger.
- Explanation of how log routing keeps the UI clean plus guidance on how a plugin should hook into `/log` or `Log.create` instead of raw `console.log`.
- Verified there are no outstanding upstream issues/PRs that would invalidate this approach.

## Plan (Phases)
1. **Implementation Deep-Dive** – Read `log.ts`, `global/index.ts`, and `CLI/TUI bootstrap` files to understand the logging core (completed via references above).
2. **Usage Survey** – Catalog how major subsystems (server, plugin loader, project state, worker processes) obtain and use scoped loggers; note the `/log` ingestion route (completed).
3. **Integration Guidance** – Synthesize the findings into actionable guidance for this plugin (e.g., initialize `Log` early, emit structured logs, optionally POST to `/log`), then answer the user’s question referencing these artifacts (in progress).
