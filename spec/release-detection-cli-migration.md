# Release Detection CLI Migration

## Code References
- `scripts/detect-release-type.mjs:127-187`: `callOpencodeModel()` constructs a manual HTTP POST to `https://opencode.ai/zen/v1/responses` using `fetch` and the `opencode/gpt-5-nano` model with JSON schema output parsing.
- `scripts/detect-release-type.mjs:208-272`: `main()` builds prompts, invokes the analyzer helper, formats release notes, and writes JSON output. This flow will need to consume CLI output instead of parsed HTTP responses.

## Existing Issues / PRs
- Searched local repository history and spec directory; no existing issue or PR covers migrating release detection to use the `opencode` CLI.

## Requirements
1. Replace the manual HTTP call with an invocation of `opencode run -m opencode/gpt-5-nano "<prompt>"`, so the plugin uses the CLI-managed authentication and URL configuration.
2. Ensure command failures are handled gracefully, falling back to the current patch-bump logic with helpful error messages.
3. Preserve the current JSON result structure (`release-analysis.json`) and downstream GitHub Actions outputs.
4. Keep compatibility with existing CLI usage (`node scripts/detect-release-type.mjs --output ...`).

## Plan
### Phase 1 – CLI Invocation Helper
- Remove `callOpencodeModel()` implementation that manually builds fetch requests.
- Introduce a helper `runOpencodeAnalyzer(systemPrompt, userPrompt)` that shells out to `opencode run -m opencode/gpt-5-nano` with the combined prompt (system + user context) and captures stdout.
- Parse the CLI response as JSON (the CLI already enforces the schema), or, if the CLI returns plain text, reuse the existing `extractAssistantText()` to extract the JSON snippet.

### Phase 2 – Integration With Main Flow
- Update `main()` to call the new helper.
- Ensure the fallback path still triggers when the CLI exits non-zero or the output cannot be parsed.
- Maintain structured logging for fallbacks to aid debugging inside GitHub Actions logs.

### Phase 3 – Validation and Tooling Docs
- Re-run `node scripts/detect-release-type.mjs --output release-analysis.json` locally to confirm it behaves as before (expect fallback because analyzer input likely remains ambiguous, but the CLI path should execute).
- Document the change in `release-detection-cli-migration.md` (this spec) with final notes after validation if needed.

## Definition of Done
- `scripts/detect-release-type.mjs` shells out to `opencode run` instead of hitting `https://opencode.ai/zen/v1/responses` directly.
- Script still works when `OPENCODE_API_URL` is unset, relying entirely on CLI configuration.
- Running the script locally succeeds (potentially with fallback) and produces JSON identical in shape to the previous implementation.
- No regressions in release note formatting or GitHub Actions outputs.
