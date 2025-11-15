# Release Workflow CLI Failure

## Problem Statement
The `release` GitHub Actions job invokes `scripts/detect-release-type.mjs`, which now shells out to `opencode run`. On CI runners the OpenCode CLI is not installed before this step executes, producing `spawnSync opencode ENOENT`. The workflow continues, but GitHub Actions fails later when writing multi-line outputs because the fallback logs include unmatched `EOF` markers.

## Evidence
```
Run node scripts/detect-release-type.mjs --output release-analysis.json
fatal: No names found, cannot describe anything.
[release] Falling back to patch bump: Opencode CLI failed: spawnSync opencode ENOENT
...
Error: Invalid value. Matching delimiter not found ''EOF''
```

## Code References
- `.github/workflows/ci.yml:1-120` – release job definition; no step installs the `opencode` CLI before running the analyzer.
- `scripts/detect-release-type.mjs:1-150` – now executes `execFileSync("opencode", ...)` without checking for missing binaries.
- `docs/development/ci.md:33-60` – describes release workflow setup but doesn’t mention installing the CLI for CI.

## Requirements
1. Ensure the release workflow installs the OpenCode CLI before running the release analyzer (reuse the npm install approach used in `review-response.yml`).
2. Update documentation/specs to mention the requirement so contributors know CI needs the CLI pre-installed.
3. Improve `scripts/detect-release-type.mjs` error handling: if the CLI is missing, exit with a clear message and skip attempting to parse outputs (still falling back to patch) so GHA doesn’t produce unmatched EOF markers.
4. Fix the GitHub Actions `GITHUB_OUTPUT` writes to ensure multi-line outputs use proper heredoc syntax even when analyzer falls back.

## Definition of Done
- Release workflow installs `opencode` CLI via npm (or reuses existing install action) before running the analyzer, and the analyzer step succeeds or falls back cleanly without ENOENT.
- `scripts/detect-release-type.mjs` detects missing CLI and reports actionable errors (e.g., “opencode CLI not found; ensure it is installed”).
- GHA multi-line output blocks succeed (no `Matching delimiter not found 'EOF'` errors) even when release notes contain single quotes or fallback text.
- Documentation updated (e.g., `docs/development/ci.md`) to mention the CLI installation requirement for release automation.

## Change Log
- 2025-11-15: Added npm install step for the OpenCode CLI in the release job, improved CLI error message, switched `$GITHUB_OUTPUT` heredoc to random delimiters, and documented the requirement in `docs/development/ci.md`.
