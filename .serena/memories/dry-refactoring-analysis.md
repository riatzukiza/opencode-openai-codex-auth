# DRY Refactoring Analysis

## Patterns Identified

### 1. **HTTP Caching with ETag Pattern** (High Priority)
**Files affected:** `lib/prompts/codex.ts`, `lib/prompts/opencode-codex.ts`

**Duplicate code:**
- ETag-based HTTP conditional requests (`If-None-Match` headers)
- 304 Not Modified response handling
- Cache TTL logic (15 minutes)
- File system operations (existsSync, mkdirSync, writeFileSync, readFileSync)
- Session cache management
- Cache metadata handling

**Abstraction opportunity:** Create a generic `CachedHttpFetcher` class that handles:
- ETag-based conditional requests
- File system caching with TTL
- Session cache integration
- Fallback strategies

### 2. **File System Utilities Pattern** (Medium Priority)
**Files affected:** `lib/prompts/codex.ts`, `lib/prompts/opencode-codex.ts`, `lib/logger.ts`, `lib/config.ts`

**Duplicate code:**
- `join(homedir(), ".opencode", ...)` path construction
- `mkdirSync(dir, { recursive: true })` directory creation
- `existsSync()` checks before operations
- `writeFileSync(file, content, "utf8")` writes

**Abstraction opportunity:** Create a `FileSystemUtils` module with:
- `ensureDirectory(dirPath)` - creates directory if needed
- `safeWriteFile(filePath, content)` - ensures directory exists
- `getOpenCodePath(...segments)` - standardized path construction

### 3. **Cache Configuration Constants** (Low Priority)
**Files affected:** `lib/prompts/codex.ts`, `lib/prompts/opencode-codex.ts`

**Duplicate code:**
- `CACHE_TTL_MS = 15 * 60 * 1000` (15 minutes)
- Cache directory path construction
- Cache file naming patterns

**Abstraction opportunity:** Create a `CacheConfig` constants object

### 4. **Response Processing Pattern** (Medium Priority)
**Files affected:** `lib/prompts/codex.ts`, `lib/prompts/opencode-codex.ts`

**Duplicate code:**
- Response.ok checks
- Error handling with fallbacks
- JSON parsing with error handling
- Header extraction (ETag)

**Abstraction opportunity:** Extend the HTTP caching abstraction

## Implementation Priority

1. **Phase 1:** Create `CachedHttpFetcher` abstraction (highest impact)
2. **Phase 2:** Create `FileSystemUtils` module (medium impact)  
3. **Phase 3:** Extract cache constants (low impact)
4. **Phase 4:** Update all modules to use new abstractions

## Expected Benefits

- **Reduced code duplication:** ~150 lines of duplicate code eliminated
- **Improved maintainability:** Single source of truth for caching logic
- **Better testability:** Centralized caching logic easier to test
- **Consistency:** Standardized error handling and fallback behavior
- **Mutation score improvement:** More centralized logic = higher test coverage impact

## Files to Create

1. `lib/utils/cached-http-fetcher.ts` - Generic HTTP caching abstraction
2. `lib/utils/file-system-utils.ts` - File system utilities
3. `lib/utils/cache-config.ts` - Cache configuration constants

## Files to Modify

1. `lib/prompts/codex.ts` - Use new abstractions
2. `lib/prompts/opencode-codex.ts` - Use new abstractions
3. `lib/logger.ts` - Use file system utils
4. `lib/config.ts` - Use file system utils
5. Update corresponding test files