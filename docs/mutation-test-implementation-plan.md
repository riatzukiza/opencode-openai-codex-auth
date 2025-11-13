# Mutation Test Implementation Plan

## Overview

This document provides a step-by-step implementation plan to address the critical test gaps identified in the mutation analysis. The plan is organized by priority and focuses on the files with the lowest mutation scores.

## Phase 1: Critical Test Improvements (Highest Priority)

### 1.1 Request Transformer Tests (40.00% → Target: 65.00%)

#### File: `test/request-transformer.test.ts`

#### 1.1.1 Model Normalization Edge Cases

**Current Test Gaps**:
- Missing tests for `null`/`undefined` model parameters
- Missing tests for case sensitivity and special characters
- Missing tests for boundary conditions and malformed inputs

**Implementation Steps**:

```typescript
// Add to existing describe('normalizeModel') block

describe('normalizeModel - Critical Edge Cases', () => {
    it('should handle null and undefined inputs', () => {
        expect(normalizeModel(null)).toBe('gpt-5');
        expect(normalizeModel(undefined)).toBe('gpt-5');
    });

    it('should handle empty and whitespace strings', () => {
        expect(normalizeModel('')).toBe('gpt-5');
        expect(normalizeModel('   ')).toBe('gpt-5');
        expect(normalizeModel('\t\n\r')).toBe('gpt-5');
    });

    it('should handle special characters and symbols', () => {
        expect(normalizeModel('gpt-5-codex@v1.0')).toBe('gpt-5-codex');
        expect(normalizeModel('gpt-5-codex_123')).toBe('gpt-5-codex');
        expect(normalizeModel('gpt-5-codex#beta')).toBe('gpt-5-codex');
        expect(normalizeModel('gpt-5-codex$test')).toBe('gpt-5-codex');
    });

    it('should handle comprehensive case variations', () => {
        const testCases = [
            'GPT-5-CODEX', 'gpt-5-codex', 'Gpt-5-Codex', 'GPT-5-codex',
            'gPt-5-cOdEx', 'GPT-5-CODEX-HIGH', 'gpt-5-codex-low'
        ];
        
        testCases.forEach(model => {
            const result = normalizeModel(model);
            expect(['gpt-5-codex', 'gpt-5']).toContain(result);
        });
    });

    it('should handle numeric and mixed alphanumeric models', () => {
        expect(normalizeModel('gpt-5-codex-v1')).toBe('gpt-5-codex');
        expect(normalizeModel('gpt5codex')).toBe('gpt-5');
        expect(normalizeModel('gpt_5_codex')).toBe('gpt-5');
    });

    it('should handle very long model names', () => {
        const longModel = 'very-long-model-name-with-gpt-5-codex-and-extra-stuff-that-should-be-normalized';
        expect(normalizeModel(longModel)).toBe('gpt-5-codex');
    });
});
```

#### 1.1.2 Configuration Merging Edge Cases

**Current Test Gaps**:
- Missing tests for `undefined`/`null` userConfig
- Missing tests for malformed configuration objects
- Missing tests for nested configuration conflicts

**Implementation Steps**:

```typescript
// Add to existing describe('getModelConfig') block

describe('getModelConfig - Critical Edge Cases', () => {
    it('should handle undefined and null userConfig', () => {
        expect(getModelConfig('gpt-5', undefined)).toEqual({});
        expect(getModelConfig('gpt-5', null as any)).toEqual({});
    });

    it('should handle malformed configuration objects', () => {
        const malformedConfigs = [
            { global: null },
            { models: 'not-an-object' },
            { global: {}, models: null },
            { global: undefined, models: undefined },
            { global: { reasoningEffort: 'high' }, models: 'invalid' },
            { global: null, models: { 'gpt-5': { options: { reasoningEffort: 'low' } } } }
        ];
        
        malformedConfigs.forEach((config, index) => {
            expect(() => getModelConfig('gpt-5', config as any)).not.toThrow(`Malformed config ${index}`);
        });
    });

    it('should handle nested configuration conflicts', () => {
        const conflictingConfig = {
            global: { 
                reasoningEffort: 'high',
                textVerbosity: 'medium',
                include: ['reasoning.encrypted_content']
            },
            models: {
                'gpt-5-codex': {
                    options: { 
                        reasoningEffort: 'low',  // Override global
                        textVerbosity: 'low'   // Override global
                    }
                }
            }
        };
        
        const result = getModelConfig('gpt-5-codex', conflictingConfig);
        expect(result.reasoningEffort).toBe('low'); // Per-model wins
        expect(result.textVerbosity).toBe('low');   // Per-model wins
        expect(result.include).toEqual(['reasoning.encrypted_content']); // From global
    });

    it('should handle deeply nested configuration structures', () => {
        const deepConfig = {
            global: { reasoningEffort: 'medium' },
            models: {
                'gpt-5-codex': {
                    options: { reasoningEffort: 'high' },
                    nested: {
                        level1: {
                            level2: { reasoningEffort: 'low' }
                        }
                    }
                }
            }
        };
        
        // Should only use the correct structure, ignore deep nesting
        const result = getModelConfig('gpt-5-codex', deepConfig);
        expect(result.reasoningEffort).toBe('high');
    });

    it('should handle configuration with circular references', () => {
        const config: any = { global: {} };
        config.global = config; // Circular reference
        
        expect(() => getModelConfig('gpt-5', config)).not.toThrow();
    });
});
```

#### 1.1.3 Input Filtering Edge Cases

**Current Test Gaps**:
- Missing tests for malformed input arrays
- Missing tests for mixed content types
- Missing tests for metadata preservation logic

**Implementation Steps**:

```typescript
// Add to existing describe('filterInput') block

describe('filterInput - Critical Edge Cases', () => {
    it('should handle null and undefined input', () => {
        expect(filterInput(null)).toBeNull();
        expect(filterInput(undefined)).toBeUndefined();
    });

    it('should handle non-array inputs', () => {
        const nonArrays = [
            {}, 'string', 123, true, false, () => {}, new Date()
        ];
        
        nonArrays.forEach((input, index) => {
            const result = filterInput(input as any);
            expect(result).toBe(input, `Non-array input ${index}`);
        });
    });

    it('should handle arrays with null and undefined elements', () => {
        const input = [
            null,
            undefined,
            { type: 'message', role: 'user', content: 'valid' },
            { type: 'message', role: 'assistant', content: 'also valid' }
        ];
        
        const result = filterInput(input as any);
        expect(result).toHaveLength(4);
        expect(result![0]).toBeNull();
        expect(result![1]).toBeUndefined();
        expect(result![2].content).toBe('valid');
        expect(result![3].content).toBe('also valid');
    });

    it('should handle malformed message objects', () => {
        const malformedMessages = [
            { type: 'message' }, // Missing role and content
            { role: 'user' }, // Missing type and content
            { type: 'message', role: 'user' }, // Missing content
            { type: 'invalid', role: 'user', content: 'test' }, // Invalid type
            { type: 'message', role: 'invalid', content: 'test' }, // Invalid role
            { type: 'message', role: 'user', content: null }, // Null content
            { type: 'message', role: 'user', content: 123 } // Non-string content
        ];
        
        malformedMessages.forEach((message, index) => {
            const input = [message as any];
            expect(() => filterInput(input)).not.toThrow(`Malformed message ${index}`);
        });
    });

    it('should handle complex metadata structures', () => {
        const input = [
            {
                id: 'msg_1',
                type: 'message',
                role: 'user',
                content: 'test',
                metadata: {
                    nested: { deep: { value: 'test' } },
                    array: [1, 2, 3],
                    date: new Date(),
                    null: null,
                    undefined: undefined
                }
            }
        ];
        
        const result = filterInput(input);
        expect(result).toHaveLength(1);
        expect(result![0]).not.toHaveProperty('id');
        expect(result![0]).not.toHaveProperty('metadata');
    });
});
```

### 1.2 Codex Instructions Tests (43.48% → Target: 65.00%)

#### File: `test/prompts-codex.test.ts`

#### 1.2.1 Cache Logic Edge Cases

**Current Test Gaps**:
- Missing tests for cache timestamp boundary conditions
- Missing tests for cache metadata corruption scenarios
- Missing tests for concurrent cache access patterns

**Implementation Steps**:

```typescript
// Add to existing test file

describe('getCodexInstructions - Cache Edge Cases', () => {
    beforeEach(() => {
        files.clear();
        vi.clearAllMocks();
    });

    it('should handle cache timestamp boundary conditions', async () => {
        const cacheFile = join('/mock-home', '.opencode', 'cache', 'codex-instructions.md');
        const cacheMeta = join('/mock-home', '.opencode', 'cache', 'codex-instructions-meta.json');
        
        // Test exactly at TTL boundary (stale)
        const staleTime = Date.now() - 16 * 60 * 1000; // 16 minutes ago (stale)
        const freshTime = Date.now() - 14 * 60 * 1000; // 14 minutes ago (fresh)
        
        files.set(cacheFile, 'cached-content');
        files.set(cacheMeta, JSON.stringify({
            etag: '"etag"',
            tag: 'v1',
            lastChecked: staleTime
        }));
        
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({ tag_name: 'v2' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response('fresh-content', {
                status: 200,
                headers: { etag: '"new-etag"' },
            }));
        
        const { getCodexInstructions } = await import('../lib/prompts/codex.js');
        const result = await getCodexInstructions();
        
        expect(result).toBe('fresh-content');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should handle corrupted cache metadata gracefully', async () => {
        const cacheMeta = join('/mock-home', '.opencode', 'cache', 'codex-instructions-meta.json');
        
        // Test various corruption scenarios
        const corruptionScenarios = [
            'invalid json',
            '{"etag": missing quotes}',
            '{"etag": "test", "tag": }', // Incomplete JSON
            '{"etag": "test", "lastChecked": "not-a-number"}', // Invalid timestamp
            'null', // Null content
            '', // Empty content
            '{"etag": null, "tag": null, "lastChecked": null}' // Null values
        ];
        
        for (const corruptedContent of corruptionScenarios) {
            files.clear();
            files.set(cacheMeta, corruptedContent);
            
            fetchMock.mockResolvedValue(new Response('fallback-content', {
                status: 200,
                headers: { etag: '"fallback-etag"' },
            }));
            
            const { getCodexInstructions } = await import('../lib/prompts/codex.js');
            const result = await getCodexInstructions();
            
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        }
    });

    it('should handle concurrent cache access', async () => {
        const cacheFile = join('/mock-home', '.opencode', 'cache', 'codex-instructions.md');
        const cacheMeta = join('/mock-home', '.opencode', 'cache', 'codex-instructions-meta.json');
        
        files.set(cacheFile, 'shared-content');
        files.set(cacheMeta, JSON.stringify({
            etag: '"shared-etag"',
            tag: 'v1',
            lastChecked: Date.now() - 20 * 60 * 1000 // Stale
        }));
        
        fetchMock.mockResolvedValue(new Response('fresh-content', {
            status: 200,
            headers: { etag: '"fresh-etag"' },
        }));
        
        const { getCodexInstructions } = await import('../lib/prompts/codex.js');
        
        // Simulate concurrent calls
        const promises = Array(5).fill(null).map(() => getCodexInstructions());
        const results = await Promise.all(promises);
        
        // All should return the same result
        expect(results.every(result => result === 'fresh-content')).toBe(true);
        // Should only fetch once (cache should prevent duplicate fetches)
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
```

#### 1.2.2 Error Handling Edge Cases

**Current Test Gaps**:
- Missing tests for network failure scenarios
- Missing tests for GitHub API rate limiting
- Missing tests for malformed JSON responses

**Implementation Steps**:

```typescript
describe('getCodexInstructions - Error Scenarios', () => {
    beforeEach(() => {
        files.clear();
        vi.clearAllMocks();
    });

    it('should handle GitHub API failures', async () => {
        const errorScenarios = [
            new Response('', { status: 500 }), // Server error
            new Response('', { status: 429 }), // Rate limited
            new Response('', { status: 404 }), // Not found
            new Response('', { status: 403 }), // Forbidden
            new Error('Network error'), // Network failure
            new Error('Timeout'), // Timeout
        ];
        
        for (const errorResponse of errorScenarios) {
            files.clear();
            
            if (errorResponse instanceof Error) {
                fetchMock.mockRejectedValue(errorResponse);
            } else {
                fetchMock.mockResolvedValue(errorResponse);
            }
            
            const { getCodexInstructions } = await import('../lib/prompts/codex.js');
            
            if (files.size === 0) {
                // No cache available, should throw
                await expect(getCodexInstructions()).rejects.toThrow();
            } else {
                // Cache available, should return cached content
                const result = await getCodexInstructions();
                expect(typeof result).toBe('string');
            }
        }
    });

    it('should handle malformed GitHub responses', async () => {
        const malformedResponses = [
            new Response('invalid json', { status: 200 }), // Invalid JSON
            new Response('{"incomplete": json', { status: 200 }), // Incomplete JSON
            new Response('null', { status: 200 }), // Null response
            new Response('', { status: 200 }), // Empty response
            new Response('{"tag_name": null}', { status: 200 }), // Null tag name
            new Response('{"not_tag_name": "v1"}', { status: 200 }), // Missing tag name
        ];
        
        for (const response of malformedResponses) {
            files.clear();
            fetchMock.mockResolvedValue(response);
            
            const { getCodexInstructions } = await import('../lib/prompts/codex.js');
            
            if (files.size === 0) {
                await expect(getCodexInstructions()).rejects.toThrow();
            }
        }
    });

    it('should handle partial download scenarios', async () => {
        const cacheFile = join('/mock-home', '.opencode', 'cache', 'codex-instructions.md');
        
        // Simulate partial download by throwing during file write
        const originalWriteFileSync = writeFileSync;
        writeFileSync.mockImplementationOnce((path, content) => {
            if (path === cacheFile) {
                throw new Error('Disk full');
            }
            return originalWriteFileSync(path, content);
        });
        
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({ tag_name: 'v2' }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            }))
            .mockResolvedValueOnce(new Response('partial-content', {
                status: 200,
                headers: { etag: '"partial-etag"' },
            }));
        
        const { getCodexInstructions } = await import('../lib/prompts/codex.js');
        
        // Should handle gracefully, either by throwing or returning cached content
        await expect(getCodexInstructions()).resolves.toBeDefined();
    });
});
```

## Phase 2: Moderate Test Improvements

### 2.1 Fetch Helpers Tests (65.48% → Target: 80.00%)

#### File: `test/fetch-helpers.test.ts`

#### 2.1.1 Token Refresh Logic Edge Cases

**Implementation Steps**:

```typescript
// Add to existing describe('shouldRefreshToken') block

describe('shouldRefreshToken - Edge Cases', () => {
    it('should handle token expiration boundaries', () => {
        const now = Date.now();
        
        const testCases = [
            { expires: now - 1, expected: true }, // Just expired
            { expires: now, expected: true }, // Exactly now (expired)
            { expires: now + 1, expected: false }, // Just valid
            { expires: now + 1000, expected: false }, // Clearly valid
            { expires: 0, expected: true }, // Zero timestamp
            { expires: -1, expected: true }, // Negative timestamp
        ];
        
        testCases.forEach(({ expires, expected }) => {
            const auth = {
                type: 'oauth' as const,
                access: 'token',
                refresh: 'refresh',
                expires
            };
            
            expect(shouldRefreshToken(auth)).toBe(expected);
        });
    });

    it('should handle invalid token formats', () => {
        const invalidTokens = [
            { type: 'oauth', access: '', refresh: 'refresh', expires: Date.now() + 1000 },
            { type: 'oauth', access: 'token', refresh: '', expires: Date.now() + 1000 },
            { type: 'oauth', access: 'token', refresh: 'refresh', expires: -1 },
            { type: 'oauth', access: null, refresh: 'refresh', expires: Date.now() + 1000 },
            { type: 'oauth', access: 'token', refresh: null, expires: Date.now() + 1000 },
            { type: 'oauth', access: undefined, refresh: 'refresh', expires: Date.now() + 1000 },
            { type: 'oauth', access: 'token', refresh: undefined, expires: Date.now() + 1000 },
        ];
        
        invalidTokens.forEach(token => {
            expect(shouldRefreshToken(token as any)).toBe(true);
        });
    });

    it('should handle non-oauth token types', () => {
        const nonOAuthTokens = [
            { type: 'api', key: 'test-key' },
            { type: 'bearer', token: 'test-token' },
            { type: 'basic', username: 'user', password: 'pass' },
            { type: 'custom' as any, value: 'custom' },
        ];
        
        nonOAuthTokens.forEach(token => {
            expect(shouldRefreshToken(token as any)).toBe(true);
        });
    });
});
```

#### 2.1.2 Header Creation Logic Edge Cases

**Implementation Steps**:

```typescript
// Add to existing describe('createCodexHeaders') block

describe('createCodexHeaders - Edge Cases', () => {
    it('should handle header collision scenarios', () => {
        const collisionScenarios = [
            {
                init: { headers: { 'authorization': 'existing-auth' } },
                expectedAuth: 'Bearer test-access-token'
            },
            {
                init: { headers: { 'x-openai-account-id': 'existing-account' } },
                expectedAccount: 'test-account-123'
            },
            {
                init: { headers: { 'x-api-key': 'should-be-removed' } },
                shouldRemove: true
            },
            {
                init: { headers: { 'content-type': 'application/xml' } },
                shouldPreserve: true
            }
        ];
        
        collisionScenarios.forEach((scenario, index) => {
            const headers = createCodexHeaders(
                scenario.init as any,
                'test-account-123',
                'test-access-token',
                { model: 'gpt-5', promptCacheKey: 'test-key' }
            );
            
            if (scenario.expectedAuth) {
                expect(headers.get('authorization')).toBe(scenario.expectedAuth);
            }
            if (scenario.expectedAccount) {
                expect(headers.get('x-openai-account-id')).toBe(scenario.expectedAccount);
            }
            if (scenario.shouldRemove) {
                expect(headers.has('x-api-key')).toBe(false);
            }
            if (scenario.shouldPreserve) {
                expect(headers.get('content-type')).toBe('application/xml');
            }
        });
    });

    it('should handle special characters in header values', () => {
        const specialValues = [
            'test@header#value$with%special&chars*',
            'header with spaces',
            'header\twith\ttabs',
            'header\nwith\nnewlines',
            'header"with"quotes',
            'header\'with\'apostrophes',
            'header<with>brackets',
            'header{with}braces',
            'header/with/slashes',
            'header\\with\\backslashes',
        ];
        
        specialValues.forEach(value => {
            const headers = createCodexHeaders(
                undefined,
                value,
                value,
                { model: 'gpt-5', promptCacheKey: value }
            );
            
            expect(headers.get('authorization')).toBe(`Bearer ${value}`);
            expect(headers.get('x-openai-account-id')).toBe(value);
            expect(headers.get('x-openai-session-id')).toBe(value);
            expect(headers.get('x-openai-conversation-id')).toBe(value);
        });
    });

    it('should handle undefined/null options', () => {
        const undefinedOptions = [
            undefined,
            null,
            {},
            { model: undefined },
            { model: null },
            { promptCacheKey: undefined },
            { promptCacheKey: null },
        ];
        
        undefinedOptions.forEach(options => {
            expect(() => {
                createCodexHeaders(
                    undefined,
                    'test-account',
                    'test-token',
                    options as any
                );
            }).not.toThrow();
        });
    });
});
```

## Implementation Timeline

### Week 1: Phase 1 Critical Improvements
- **Days 1-2**: Implement Request Transformer edge case tests
- **Days 3-4**: Implement Codex Instructions edge case tests  
- **Day 5**: Run mutation testing and verify improvements

### Week 2: Phase 2 Moderate Improvements
- **Days 1-3**: Implement Fetch Helpers edge case tests
- **Days 4-5**: Implement Response Handler edge case tests

### Week 3: Verification and Optimization
- **Days 1-2**: Run comprehensive mutation testing
- **Days 3-4**: Analyze remaining surviving mutations
- **Day 5**: Final optimization and documentation

## Success Metrics

### Phase 1 Success Criteria
- Request Transformer mutation score: 40.00% → 65.00% (+25%)
- Codex Instructions mutation score: 43.48% → 65.00% (+21.52%)
- Overall mutation score: 59.66% → 67.00% (+7.34%)

### Phase 2 Success Criteria
- Fetch Helpers mutation score: 65.48% → 80.00% (+14.52%)
- Response Handler mutation score: 70.77% → 85.00% (+14.23%)
- Overall mutation score: 67.00% → 75.00% (+8.00%)

### Final Success Criteria
- Overall mutation score: **75.00%** (exceeds 60% threshold)
- All critical files above 65% mutation score
- No critical surviving mutations in core functionality

## Risk Mitigation

### Potential Risks
1. **Test Flakiness**: New tests might be flaky due to timing dependencies
2. **Mock Complexity**: Complex mocking might make tests hard to maintain
3. **Performance Impact**: Additional tests might slow down test execution

### Mitigation Strategies
1. **Test Isolation**: Ensure each test is completely isolated
2. **Mock Simplification**: Use simple, predictable mocks
3. **Test Optimization**: Group related tests and use shared setup where appropriate
4. **Continuous Monitoring**: Monitor test execution times and flakiness

## Next Steps

1. **Immediate**: Start implementing Phase 1 test improvements
2. **Daily**: Run mutation testing to track progress
3. **Weekly**: Review and adjust implementation plan based on results
4. **Final**: Document lessons learned and best practices