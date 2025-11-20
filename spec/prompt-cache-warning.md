# Prompt cache warning handling

- Code files/lines: `lib/request/request-transformer.ts` (prompt cache logging around ensurePromptCacheKey at ~1012-1040); `lib/request/fetch-helpers.ts` (call to transformRequestBody around ~150-170); tests in `test/request-transformer.test.ts` (prompt_cache_key generation cases around ~700+).
- Existing issues/PRs: none spotted in spec/ or docs; no repository issues/PRs reviewed yet.
- Definition of done: first request of a new session generates the fallback prompt cache log without emitting a warning; later unexpected regenerations still surface via warning; automated tests cover the new non-warning behavior for new sessions and existing suites pass.
- Requirements: keep the startup log payload (promptCacheKey/fallbackHash/hints) but downgrade severity on the initial session start; ensure session context flows through if needed; add/adjust tests to pin the expected log level; avoid regressions in prompt cache key derivation.
