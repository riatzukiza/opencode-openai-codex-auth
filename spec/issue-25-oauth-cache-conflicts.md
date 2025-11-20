# Issue 25 – OAuth Cache Conflicts Between Plugins

**Issue**: #25 (BUG) Plugin fails with confusing errors if started with the other oauth plugin's cache files

## Context & Current Behavior

- **Problem**: Users switching from `opencode-openai-codex-auth` to `@openhax/codex` encounter cache conflicts
- **Root Cause**: Both plugins use the same cache directory (`~/.opencode/cache/`) but with different:
  - Cache file formats
  - Fetch URLs (different GitHub repositories)
  - Metadata structures
- **Error Message**: `Failed to fetch OpenCode codex.txt: 404 Failed to fetch OpenCode codex.txt from GitHub`
- **User Impact**: Poor conversion experience, users think our plugin is broken

## Current Cache Files

- `lib/prompts/opencode-codex.ts:31-129` - Fetches from `sst/opencode` repo
- `lib/utils/cache-config.ts:26-35` - Defines cache file names:
  - `opencode-codex.txt` - OpenCode prompt content
  - `opencode-codex-meta.json` - ETag and metadata
- Cache location: `~/.opencode/cache/` (shared with other plugin)

## Solution Strategy

### 1. Plugin-Specific Cache Namespace

**Goal**: Isolate our cache files from other plugins
**Implementation**:

- Add plugin identifier prefix to cache files
- Use `openhax-codex-` prefix for all cache files
- Update cache paths to use plugin-specific subdirectory

### 2. Graceful Cache Migration & Validation

**Goal**: Handle existing cache files gracefully
**Implementation**:

- Detect incompatible cache formats
- Provide clear migration messages
- Fallback to fresh fetch when cache is invalid
- Don't fail with cryptic errors

### 3. Enhanced Error Handling

**Goal**: Better user experience during plugin switching
**Implementation**:

- Detect cache conflict scenarios
- Provide helpful error messages
- Suggest cache cleanup steps
- Continue operation when possible

## Implementation Plan

### Phase 1: Plugin-Specific Cache Files

1. Update `lib/utils/cache-config.ts`:
   - Add plugin-specific cache file names
   - Use `openhax-codex-` prefix
2. Update `lib/prompts/opencode-codex.ts`:
   - Use new cache file paths
   - Maintain backward compatibility during migration
3. Update `lib/prompts/codex.ts`:
   - Apply same prefix to Codex instruction cache

### Phase 2: Cache Validation & Migration

1. Add cache format validation:
   - Check if cache files are from our plugin
   - Detect incompatible formats
2. Implement graceful migration:
   - Backup existing cache if needed
   - Create fresh cache files
   - Log migration actions

### Phase 3: Enhanced Error Messages

1. Improve error handling in `lib/prompts/opencode-codex.ts`:
   - Detect cache conflict scenarios
   - Provide actionable error messages
2. Add cache cleanup guidance:
   - Suggest manual cleanup steps
   - Include commands for cache reset

## Definition of Done / Requirements

### Functional Requirements

- [ ] Plugin uses isolated cache files with `openhax-codex-` prefix
- [ ] Graceful handling of existing cache from other plugins
- [ ] Clear error messages when cache conflicts are detected
- [ ] Automatic cache migration without user intervention
- [ ] Fallback to fresh fetch when cache is incompatible

### Non-Functional Requirements

- [ ] No breaking changes for existing users of our plugin
- [ ] Backward compatibility with our current cache format
- [ ] Performance impact is minimal (cache isolation overhead)
- [ ] Error messages are actionable and user-friendly

### Test Coverage

- [ ] Tests for cache file isolation
- [ ] Tests for cache migration scenarios
- [ ] Tests for error handling with invalid cache
- [ ] Tests for backward compatibility
- [ ] Integration tests for plugin switching scenarios

## Files to Modify

### Core Changes

- `lib/utils/cache-config.ts` - Plugin-specific cache file names
- `lib/prompts/opencode-codex.ts` - Isolated cache paths + validation
- `lib/prompts/codex.ts` - Apply prefix to Codex cache files

### Test Updates

- `test/prompts-opencode-codex.test.ts` - Update cache file paths
- `test/prompts-codex.test.ts` - Test cache isolation
- Add new tests for cache migration and conflict handling

## User Experience Improvements

### Before (Current)

```
ERROR Failed to fetch OpenCode codex.txt: 404 Failed to fetch OpenCode codex.txt from GitHub
```

### After (Target)

```
WARN Detected cache files from different plugin. Creating fresh cache for @openhax/codex...
INFO Cache migration completed successfully.
INFO Ready to use @openhax/codex with isolated cache.
```

## Migration Strategy

### For New Users

- No impact - will start with clean, isolated cache

### For Existing Users

- Automatic migration on first run
- Preserve existing cache in backup location
- No manual intervention required
- Clear communication about migration

### For Users Switching Between Plugins

- Graceful cache conflict detection
- Actionable error messages
- Simple cache cleanup commands if needed
