# Session Manager item equality helper

## Scope and references

- lib/session/session-manager.ts: longestSharedPrefixLength (around lines 22-37) uses JSON.stringify comparison
- lib/session/session-manager.ts: findSuffixReuseStart (around lines 92-103) uses JSON.stringify comparison

## Existing issues

- None observed related to this refactor (no issue referenced in request)

## Existing PRs

- None observed; task requested directly by review comment

## Definition of done

- Shared helper (e.g., itemsEqual) added to centralize equality check with safe JSON stringify in try/catch
- longestSharedPrefixLength and findSuffixReuseStart use the helper instead of inline JSON.stringify comparisons
- Build/test commands remain passing or noted if not run

## Requirements

- Avoid duplicated JSON.stringify comparisons; centralize error handling for failed stringify
- Apply helper in both functions mentioned in review
- Create new branch and open PR targeting dev when changes are complete
