# PR #29 Review Thread Analysis

## Summary

PR #29 has **1 unresolved review thread** from `coderabbitai` containing **19 actionable comments** across multiple categories.

## Action Items by Category

### 🚨 **BLOCKER Issues (Must Fix)**

1. **Content-Type Header Bug** - `lib/request/fetch-helpers.ts:302-308`
   - **Issue**: `handleErrorResponse` unconditionally sets JSON content-type on potentially non-JSON bodies
   - **Impact**: Misleads callers, causes `response.json()` parse errors on HTML responses
   - **Fix**: Preserve original content-type or wrap raw body in JSON envelope

2. **Cache Bypass Bug** - `lib/prompts/codex.ts:90`
   - **Issue**: `getLatestReleaseTag()` failure bypasses cache/bundled fallbacks
   - **Impact**: Network failures break the entire fallback chain
   - **Fix**: Wrap entire setup in try/catch to ensure fallback path

### 🧪 **Test Improvements**

3. **Remove Unused Mocks** - `test/cache-warming.test.ts:118-165`
   - Remove `mockGetCodexInstructions`/`mockGetOpenCodeCodexPrompt` from `areCachesWarm` tests

4. **Fix Mock Leakage** - `test/index.test.ts:22-28, 93-121`
   - Reset `sessionManager` instance mocks in `beforeEach` to prevent cross-test leakage

5. **Add Missing Test Case** - `test/codex-fetcher.test.ts`
   - Add direct `compactionDecision` test case coverage

6. **Fix Redundant Tests** - `test/codex-fetcher.test.ts:272-287`
   - Either provide distinct inputs for short/long text scenarios or remove redundant test

### 🔧 **Code Quality Improvements**

7. **Logger Hardening** - `lib/logger.ts:138-159`
   - Add try/catch around `JSON.stringify(extra)` to prevent logging failures
   - Remove unused `error` parameter from `logToConsole`

### 📊 **Coverage Issues**

8. **Docstring Coverage** - Overall: 46.28% (Required: 80%)
   - Multiple files need docstring improvements to meet coverage requirements

## Files Requiring Changes

### Critical Files (Blockers)

- `lib/request/fetch-helpers.ts` - Content-type header fix
- `lib/prompts/codex.ts` - Cache fallback fix

### Test Files

- `test/cache-warming.test.ts` - Remove unused mocks
- `test/index.test.ts` - Fix mock leakage
- `test/codex-fetcher.test.ts` - Add missing test case, fix redundancy

### Code Quality

- `lib/logger.ts` - Harden JSON.stringify, remove unused parameter

### Multiple Files (Docstring Coverage)

- Various files need docstring additions to reach 80% coverage

## Priority Order

1. **Blocker fixes** (content-type, cache fallback)
2. **Test improvements** (mock leakage, missing coverage)
3. **Code quality** (logger hardening)
4. **Documentation** (docstring coverage)

## Definition of Done

- [x] Content-type header bug fixed and tested
- [x] Cache fallback properly handles network failures
- [x] All test issues resolved
- [x] Logger hardened against JSON failures
- [x] Docstring coverage reaches acceptable levels
- [x] All tests pass (398 passed, 2 skipped)
- [ ] Code review thread resolved
