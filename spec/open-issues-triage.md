# Open Issues Triage Analysis

**Date**: 2025-11-19  
**Repository**: open-hax/codex  
**Total Open Issues**: 10

## Proposed Labels

### Topic Labels

- `authentication` - OAuth, token management, cache file conflicts
- `session-management` - SessionManager, prompt cache keys, fork handling
- `compaction` - Conversation compaction, summary handling
- `model-support` - New model variants, normalization
- `metrics` - Request inspection, performance metrics
- `documentation` - README updates, package naming

### Priority Labels

- `priority-high` - Breaking bugs, critical functionality
- `priority-medium` - Important features, significant improvements
- `priority-low` - Minor enhancements, documentation fixes

### Effort Labels

- `effort-small` - < 4 hours, simple changes
- `effort-medium` - 4-12 hours, moderate complexity
- `effort-large` - > 12 hours, complex implementation

---

## Issue Triage Details

### #26: Feature: Add support for GPT-5.1-Codex-Max model

**Labels**: `model-support`, `priority-medium`, `effort-small`  
**Related Files**:

- `lib/request/request-transformer.ts:217-244` - Model normalization logic
- `test/request-transformer.test.ts:50-120` - Model normalization tests

### #25: [BUG] Plugin fails with confusing errors if started with the other oauth plugin's cache files

**Labels**: `authentication`, `priority-high`, `effort-medium`  
**Related Files**:

- `lib/auth/auth.ts:31-69` - Token validation and refresh logic
- `lib/cache/session-cache.ts` - Cache file handling
- `lib/prompts/codex.ts:79-146` - Cache file operations

### #24: Tests: clarify extractTailAfterSummary semantics in codex-compaction

**Labels**: `compaction`, `priority-low`, `effort-small`  
**Related Files**:

- `lib/compaction/codex-compaction.ts:119` - extractTailAfterSummary function
- `test/codex-compaction.test.ts:86-93` - Related tests

### #23: SessionManager: align fork identifier with prompt cache fork hints

**Labels**: `session-management`, `priority-medium`, `effort-medium`  
**Related Files**:

- `lib/session/session-manager.ts:139-395` - SessionManager implementation
- `lib/request/request-transformer.ts:755-925` - Fork handling and cache key logic
- `test/session-manager.test.ts:161-181` - Fork session tests

### #22: Compaction heuristics: prefer explicit metadata flag for OpenCode prompts

**Labels**: `compaction`, `priority-medium`, `effort-medium`  
**Related Files**:

- `lib/request/request-transformer.ts:442-506` - OpenCode prompt filtering
- `lib/compaction/codex-compaction.ts` - Compaction logic
- `test/request-transformer.test.ts:596-624` - Compaction integration tests

### #21: Compaction: make extractTailAfterSummary summary-aware

**Labels**: `compaction`, `priority-medium`, `effort-medium`  
**Related Files**:

- `lib/compaction/codex-compaction.ts:119` - Core function
- `lib/compaction/compaction-executor.ts:1-45` - Compaction execution
- `test/codex-compaction.test.ts:86-93` - Function tests

### #6: Feature: richer Codex metrics and request inspection commands

**Labels**: `metrics`, `priority-medium`, `effort-large`  
**Related Files**:

- `lib/commands/codex-metrics.ts:1-343` - Metrics command implementation
- `lib/cache/cache-metrics.ts` - Cache metrics collection
- `test/codex-metrics-command.test.ts:1-342` - Comprehensive tests

### #5: Feature: Codex-style conversation compaction and auto-compaction in plugin

**Labels**: `compaction`, `priority-high`, `effort-large`  
**Related Files**:

- `lib/compaction/compaction-executor.ts:1-45` - Auto-compaction logic
- `lib/request/fetch-helpers.ts:120-185` - Compaction integration
- `lib/session/session-manager.ts:296-313` - Compaction state management
- `test/compaction-executor.test.ts:11-131` - Compaction tests

### #4: Feature: fork-aware prompt_cache_key handling and overrides

**Labels**: `session-management`, `priority-high`, `effort-large`  
**Related Files**:

- `lib/request/request-transformer.ts:755-1036` - Fork-aware cache key logic
- `lib/session/session-manager.ts:83-206` - Session ID derivation
- `test/request-transformer.test.ts:715-850` - Cache key tests
- `test/session-manager.test.ts:161-181` - Fork session tests

### #11: Docs: Fix package name in test/README.md

**Labels**: `documentation`, `priority-low`, `effort-small`  
**Related Files**:

- `test/README.md:1-4` - Package name reference

---

## Priority Summary

### High Priority (3 issues)

- #25: OAuth cache file conflicts (bug)
- #5: Auto-compaction implementation (feature)
- #4: Fork-aware cache keys (feature)

### Medium Priority (5 issues)

- #26: GPT-5.1-Codex-Max support (feature)
- #23: SessionManager fork alignment (feature)
- #22: Compaction metadata flags (feature)
- #21: Summary-aware compaction (feature)
- #6: Enhanced metrics (feature)

### Low Priority (2 issues)

- #24: Test clarification (maintenance)
- #11: Documentation fix (maintenance)

## Effort Distribution

### Large Effort (>12 hours): 3 issues

- #6: Enhanced metrics and inspection
- #5: Auto-compaction implementation
- #4: Fork-aware cache key handling

### Medium Effort (4-12 hours): 5 issues

- #25: OAuth cache file conflicts
- #23: SessionManager fork alignment
- #22: Compaction metadata flags
- #21: Summary-aware compaction
- #26: GPT-5.1-Codex-Max support

### Small Effort (<4 hours): 2 issues

- #24: Test clarification
- #11: Documentation fix

## Topic Distribution

- Session Management: 2 issues (#4, #23)
- Compaction: 4 issues (#5, #21, #22, #24)
- Authentication: 1 issue (#25)
- Model Support: 1 issue (#26)
- Metrics: 1 issue (#6)
- Documentation: 1 issue (#11)

## Recommendations

1. **Immediate Focus**: Address #25 (OAuth cache conflicts) as it's a breaking bug
2. **Strategic Features**: Prioritize #4 and #5 for core functionality improvements
3. **Quick Wins**: Complete #11 and #24 for immediate closure
4. **Incremental Development**: #21, #22, #23 can be tackled in sequence as they're related
5. **Future Enhancement**: #6 and #26 can be scheduled for future releases

## Cross-Dependencies

- #4 (fork-aware cache keys) enables #23 (SessionManager alignment)
- #21 and #22 both enhance compaction heuristics and should be coordinated
- #5 depends on improvements from #21 and #22 for optimal implementation
