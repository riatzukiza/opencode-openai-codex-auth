# Mutation Testing Analysis Report

## Executive Summary

Based on the mutation testing results, the overall mutation score is **59.66%**, which is below the target threshold of 60%. The analysis reveals significant test coverage gaps in specific modules, particularly in the `request` (48.47%) and `prompts` (56.04%) modules. This report identifies the specific types of mutations that are surviving and provides targeted recommendations to improve test coverage.

## Mutation Score Breakdown

| Module | Score | Status | Key Files |
|--------|-------|---------|-----------|
| **All files** | **59.66%** | **Below Threshold** | - |
| **lib** | **58.92%** | **Below Threshold** | - |
| **auth** | **82.03%** | **Good** | auth.ts, server.ts, browser.ts |
| **cache** | **74.74%** | **Good** | cache-metrics.ts, cache-warming.ts, etc. |
| **prompts** | **56.04%** | **Needs Improvement** | codex.ts (43.48%), opencode-codex.ts (71.74%) |
| **request** | **48.47%** | **Critical** | request-transformer.ts (40.00%), fetch-helpers.ts (65.48%), response-handler.ts (70.77%) |
| **session** | **59.72%** | **Close to Threshold** | response-recorder.ts, session-manager.ts |

## Critical Issues Analysis

### 1. Request Transformer (40.00% - Critical)

**File**: `lib/request/request-transformer.ts`

**Surviving Mutation Types** (inferred from code analysis):

#### A. Model Normalization Logic
```typescript
// Current implementation likely has surviving mutations in:
export function normalizeModel(model: string | undefined): string {
    if (!model) return "gpt-5";  // Mutation: return "gpt-4" 
    const normalized = model.toLowerCase();  // Mutation: remove toLowerCase()
    
    if (normalized.includes("codex-mini")) {  // Mutation: change to "codex"
        return "codex-mini-latest";
    }
    // ... more logic
}
```

**Test Gaps**:
- Missing tests for `null`/`undefined` model edge cases
- Missing tests for case sensitivity variations
- Missing tests for malformed model names
- Missing tests for model name boundaries (empty strings, special characters)

#### B. Configuration Merging Logic
```typescript
// Complex configuration merging likely has surviving mutations:
function getModelConfig(model: string, userConfig: UserConfig): ConfigOptions {
    // Mutation: changing merge priority logic
    // Mutation: missing undefined/null checks
    // Mutation: error handling for malformed configs
}
```

**Test Gaps**:
- Missing tests for `undefined`/`null` userConfig
- Missing tests for malformed configuration objects
- Missing tests for configuration property conflicts
- Missing tests for nested configuration merging

#### C. Input Filtering Logic
```typescript
// ID removal logic may have surviving mutations:
function filterInput(input: InputItem[], options?: FilterOptions): InputItem[] | undefined {
    // Mutation: changing ID filtering logic
    // Mutation: metadata handling variations
    // Mutation: array boundary conditions
}
```

**Test Gaps**:
- Missing tests for malformed input arrays
- Missing tests for mixed content types
- Missing tests for metadata preservation logic
- Missing tests for edge case input structures

### 2. Codex Instructions Fetcher (43.48% - Critical)

**File**: `lib/prompts/codex.ts`

**Surviving Mutation Types**:

#### A. Cache Logic
```typescript
// Cache freshness checking likely has surviving mutations:
const isCacheFresh = Boolean(
    cachedTimestamp && (Date.now() - cachedTimestamp) < CACHE_TTL_MS && cacheFileExists,
);  // Mutation: changing comparison operators, removing conditions
```

**Test Gaps**:
- Missing tests for cache timestamp boundary conditions
- Missing tests for cache file existence edge cases
- Missing tests for cache metadata corruption scenarios
- Missing tests for concurrent cache access patterns

#### B. Error Handling
```typescript
// Error handling in fetch operations likely has surviving mutations:
try {
    const latestTag = await getLatestReleaseTag();
    // Mutation: removing error handling, changing error propagation
} catch (error) {
    // Mutation: changing fallback logic
}
```

**Test Gaps**:
- Missing tests for network failure scenarios
- Missing tests for GitHub API rate limiting
- Missing tests for malformed JSON responses
- Missing tests for partial download scenarios

### 3. Fetch Helpers (65.48% - Needs Improvement)

**File**: `lib/request/fetch-helpers.ts`

**Surviving Mutation Types**:

#### A. Token Refresh Logic
```typescript
// Token refresh decision logic may have surviving mutations:
function shouldRefreshToken(auth: Auth): boolean {
    if (auth.type !== 'oauth') return true;  // Mutation: changing condition
    if (!auth.access) return true;  // Mutation: removing null check
    return Date.now() >= auth.expires;  // Mutation: changing comparison
}
```

**Test Gaps**:
- Missing tests for token expiration boundary conditions
- Missing tests for invalid token formats
- Missing tests for concurrent token refresh scenarios
- Missing tests for token refresh failure recovery

#### B. Header Creation Logic
```typescript
// Header creation and manipulation likely has surviving mutations:
function createCodexHeaders(init: RequestInit, accountId: string, accessToken: string, options: HeaderOptions): Headers {
    // Mutation: header preservation logic
    // Mutation: header removal logic
    // Mutation: default header application
}
```

**Test Gaps**:
- Missing tests for header collision scenarios
- Missing tests for malformed header values
- Missing tests for header case sensitivity
- Missing tests for special header characters

## Targeted Test Improvements

### Phase 1: Critical Fixes (Target: +15% improvement)

#### 1.1 Request Transformer Enhancements

**Add comprehensive model normalization tests**:
```typescript
describe('normalizeModel - Edge Cases', () => {
    it('should handle null and undefined', () => {
        expect(normalizeModel(null)).toBe('gpt-5');
        expect(normalizeModel(undefined)).toBe('gpt-5');
    });
    
    it('should handle empty and whitespace strings', () => {
        expect(normalizeModel('')).toBe('gpt-5');
        expect(normalizeModel('   ')).toBe('gpt-5');
    });
    
    it('should handle special characters and numbers', () => {
        expect(normalizeModel('gpt-5-codex@v1.0')).toBe('gpt-5-codex');
        expect(normalizeModel('gpt-5-codex_123')).toBe('gpt-5-codex');
    });
    
    it('should handle case variations comprehensively', () => {
        const testCases = [
            'GPT-5-CODEX', 'gpt-5-codex', 'Gpt-5-Codex', 'GPT-5-codex'
        ];
        testCases.forEach(model => {
            expect(normalizeModel(model)).toBe('gpt-5-codex');
        });
    });
});
```

**Add configuration merging edge case tests**:
```typescript
describe('getModelConfig - Edge Cases', () => {
    it('should handle undefined/null userConfig', () => {
        expect(getModelConfig('gpt-5', undefined)).toEqual({});
        expect(getModelConfig('gpt-5', null)).toEqual({});
    });
    
    it('should handle malformed configuration objects', () => {
        const malformedConfigs = [
            { global: null },
            { models: 'not-an-object' },
            { global: {}, models: null },
            { global: undefined, models: undefined }
        ];
        
        malformedConfigs.forEach(config => {
            expect(() => getModelConfig('gpt-5', config as any)).not.toThrow();
        });
    });
    
    it('should handle nested configuration conflicts', () => {
        const conflictingConfig = {
            global: { reasoningEffort: 'high' },
            models: {
                'gpt-5-codex': {
                    options: { reasoningEffort: 'low' }
                }
            }
        };
        
        const result = getModelConfig('gpt-5-codex', conflictingConfig);
        expect(result.reasoningEffort).toBe('low'); // Per-model wins
    });
});
```

#### 1.2 Codex Instructions Fetcher Enhancements

**Add cache logic edge case tests**:
```typescript
describe('getCodexInstructions - Cache Edge Cases', () => {
    it('should handle cache timestamp boundary conditions', () => {
        // Test exactly at TTL boundary
        const staleTime = Date.now() - CACHE_TTL_MS;
        const freshTime = Date.now() - CACHE_TTL_MS + 1;
        
        // Mock cache metadata with boundary timestamps
        // Verify behavior at exact boundaries
    });
    
    it('should handle corrupted cache metadata gracefully', () => {
        // Test malformed JSON in cache metadata
        // Test missing required fields in metadata
        // Test invalid timestamp formats
    });
    
    it('should handle concurrent cache access', async () => {
        // Test multiple simultaneous calls to getCodexInstructions
        // Verify cache consistency and no race conditions
    });
});
```

**Add comprehensive error handling tests**:
```typescript
describe('getCodexInstructions - Error Scenarios', () => {
    it('should handle GitHub API failures', async () => {
        // Test 500 errors from GitHub API
        // Test rate limiting scenarios
        // Test network timeouts
    });
    
    it('should handle malformed GitHub responses', async () => {
        // Test invalid JSON in release data
        // Test missing required fields in release data
        // Test empty response bodies
    });
    
    it('should handle partial download scenarios', async () => {
        // Test incomplete file downloads
        // Test corrupted file content
        // Test file system permission errors
    });
});
```

### Phase 2: Moderate Improvements (Target: +10% improvement)

#### 2.1 Fetch Helpers Enhancements

**Add token refresh edge case tests**:
```typescript
describe('shouldRefreshToken - Edge Cases', () => {
    it('should handle token expiration boundaries', () => {
        const now = Date.now();
        const expiredToken = {
            type: 'oauth' as const,
            access: 'token',
            refresh: 'refresh',
            expires: now - 1  // Just expired
        };
        const validToken = {
            type: 'oauth' as const,
            access: 'token',
            refresh: 'refresh',
            expires: now + 1  // Just valid
        };
        
        expect(shouldRefreshToken(expiredToken)).toBe(true);
        expect(shouldRefreshToken(validToken)).toBe(false);
    });
    
    it('should handle invalid token formats', () => {
        const invalidTokens = [
            { type: 'oauth', access: '', refresh: 'refresh', expires: Date.now() + 1000 },
            { type: 'oauth', access: 'token', refresh: '', expires: Date.now() + 1000 },
            { type: 'oauth', access: 'token', refresh: 'refresh', expires: -1 },
            { type: 'oauth', access: null, refresh: 'refresh', expires: Date.now() + 1000 }
        ];
        
        invalidTokens.forEach(token => {
            expect(shouldRefreshToken(token as any)).toBe(true);
        });
    });
});
```

**Add header creation edge case tests**:
```typescript
describe('createCodexHeaders - Edge Cases', () => {
    it('should handle header collision scenarios', () => {
        const init = {
            headers: {
                'authorization': 'existing-auth',
                'content-type': 'application/xml',
                'x-api-key': 'should-be-removed'
            }
        };
        
        const headers = createCodexHeaders(init, 'account-id', 'access-token', {
            model: 'gpt-5',
            promptCacheKey: 'test-key'
        });
        
        expect(headers.get('authorization')).toBe('Bearer access-token');
        expect(headers.get('content-type')).toBe('application/xml');
        expect(headers.has('x-api-key')).toBe(false);
    });
    
    it('should handle special characters in header values', () => {
        const specialChars = 'test@header#value$with%special&chars*';
        const headers = createCodexHeaders(undefined, specialChars, specialChars, {
            model: 'gpt-5',
            promptCacheKey: specialChars
        });
        
        expect(headers.get('authorization')).toBe(`Bearer ${specialChars}`);
        expect(headers.get('x-openai-account-id')).toBe(specialChars);
    });
});
```

### Phase 3: Final Optimizations (Target: +5% improvement)

#### 3.1 Response Handler Enhancements

**Add SSE parsing edge case tests**:
```typescript
describe('convertSseToJson - Edge Cases', () => {
    it('should handle malformed SSE streams', async () => {
        const malformedStreams = [
            'data: not json\ndata: more not json\n',
            'data: {"type": "incomplete"\ndata: {"type": "response.done"}\n',
            'data: \n\n\n',  // Empty data lines
            'data: "unclosed string\ndata: {"valid": "json"}\n'
        ];
        
        for (const stream of malformedStreams) {
            const response = new Response(stream);
            const headers = new Headers();
            const result = await convertSseToJson(response, headers);
            expect(result).toBeDefined();
        }
    });
    
    it('should handle large SSE streams efficiently', async () => {
        const largeStream = 'data: {"type": "chunk", "delta": "x"}\n'.repeat(10000) +
                           'data: {"type": "response.done", "response": {"id": "large"}}\n';
        
        const response = new Response(largeStream);
        const headers = new Headers();
        const result = await convertSseToJson(response, headers);
        
        const body = await result.json();
        expect(body.id).toBe('large');
    });
});
```

## Expected Impact

### Phase 1 Implementation (Critical Fixes)
- **Request Transformer**: 40.00% → 65.00% (+25%)
- **Codex Instructions**: 43.48% → 65.00% (+21.52%)
- **Overall Impact**: +8-10% improvement

### Phase 2 Implementation (Moderate Improvements)  
- **Fetch Helpers**: 65.48% → 80.00% (+14.52%)
- **Overall Impact**: +3-5% improvement

### Phase 3 Implementation (Final Optimizations)
- **Response Handler**: 70.77% → 85.00% (+14.23%)
- **Overall Impact**: +2-3% improvement

### Total Expected Improvement
- **Conservative Estimate**: +13-18% (59.66% → 72.66-77.66%)
- **Optimistic Estimate**: +15-20% (59.66% → 74.66-79.66%)

## Implementation Priority

1. **High Priority**: Request Transformer tests (largest impact)
2. **High Priority**: Codex Instructions tests (critical functionality)
3. **Medium Priority**: Fetch Helpers tests (moderate impact)
4. **Low Priority**: Response Handler tests (smaller impact)

## Success Criteria

The mutation testing score should exceed **60%** after implementing Phase 1 improvements. The target is to reach **75%** after all phases are complete.

## Next Steps

1. Implement Phase 1 test improvements
2. Run mutation testing to verify improvements
3. Analyze remaining surviving mutations
4. Implement Phase 2 and 3 improvements
5. Final verification and documentation update