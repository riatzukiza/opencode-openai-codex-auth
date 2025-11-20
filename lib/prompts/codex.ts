import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recordCacheHit, recordCacheMiss } from "../cache/cache-metrics.js";
import { codexInstructionsCache, getCodexCacheKey } from "../cache/session-cache.js";
import { logError, logWarn } from "../logger.js";
import type { CacheMetadata, GitHubRelease } from "../types.js";
import { CACHE_FILES, CACHE_TTL_MS } from "../utils/cache-config.js";
import {
	fileExistsAndNotEmpty,
	getOpenCodePath,
	safeReadFile,
	safeWriteFile,
} from "../utils/file-system-utils.js";

// Codex instructions constants
const GITHUB_API_RELEASES = "https://api.github.com/repos/openai/codex/releases/latest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function cacheSessionEntry(data: string, etag?: string | undefined, tag?: string | undefined): void {
	const cachePayload = { data, etag, tag };

	const cacheKey = getCodexCacheKey(etag, tag);
	codexInstructionsCache.set(cacheKey, cachePayload);
	codexInstructionsCache.set("latest", cachePayload);
}

/**
 * Get the latest release tag from GitHub
 * @returns Release tag name (e.g., "rust-v0.43.0")
 */
async function getLatestReleaseTag(): Promise<string> {
	const response = await fetch(GITHUB_API_RELEASES);
	if (!response.ok) throw new Error(`Failed to fetch latest release: ${response.status}`);
	const data = (await response.json()) as GitHubRelease;
	return data.tag_name;
}

/**
 * Fetch Codex instructions from GitHub with ETag-based caching
 * Uses HTTP conditional requests to efficiently check for updates
 * Always fetches from the latest release tag, not main branch
 *
 * Rate limit protection: Only checks GitHub if cache is older than 15 minutes
 * @returns Codex instructions
 */
export async function getCodexInstructions(): Promise<string> {
	const sessionEntry = codexInstructionsCache.get("latest");
	if (sessionEntry) {
		recordCacheHit("codexInstructions");
		return sessionEntry.data;
	}
	recordCacheMiss("codexInstructions");

	let cachedETag: string | null = null;
	let cachedTag: string | null = null;
	let cachedTimestamp: number | null = null;

	const cacheMetaPath = getOpenCodePath("cache", CACHE_FILES.CODEX_INSTRUCTIONS_META);
	const cacheFilePath = getOpenCodePath("cache", CACHE_FILES.CODEX_INSTRUCTIONS);

	const cachedMetaContent = safeReadFile(cacheMetaPath);
	if (cachedMetaContent) {
		const metadata = JSON.parse(cachedMetaContent) as CacheMetadata;
		cachedETag = metadata.etag || null;
		cachedTag = metadata.tag;
		cachedTimestamp = metadata.lastChecked;
	}

	const cacheKeyFromMetadata = getCodexCacheKey(cachedETag ?? undefined, cachedTag ?? undefined);
	const sessionFromMetadata = codexInstructionsCache.get(cacheKeyFromMetadata);
	if (sessionFromMetadata) {
		cacheSessionEntry(sessionFromMetadata.data, sessionFromMetadata.etag, sessionFromMetadata.tag);
		return sessionFromMetadata.data;
	}

	const cacheFileExists = fileExistsAndNotEmpty(cacheFilePath);
	const isCacheFresh = Boolean(
		cachedTimestamp && Date.now() - cachedTimestamp < CACHE_TTL_MS && cacheFileExists,
	);

	if (isCacheFresh) {
		const fileContent = safeReadFile(cacheFilePath) || "";
		cacheSessionEntry(fileContent, cachedETag || undefined, cachedTag || undefined);
		return fileContent;
	}

	let latestTag: string | undefined;
	try {
		latestTag = await getLatestReleaseTag();
	} catch (error) {
		// If we can't get the latest tag, fall back to cache or bundled version
		logWarn("Failed to get latest release tag, falling back to cache/bundled", { error });
		// Fall back to bundled instructions
		const bundledContent = readFileSync(join(__dirname, "codex-instructions.md"), "utf8");
		cacheSessionEntry(bundledContent, undefined, undefined);
		return bundledContent;
	}

	const cacheKeyForLatest = getCodexCacheKey(cachedETag ?? undefined, latestTag);
	const sessionForLatest = codexInstructionsCache.get(cacheKeyForLatest);
	if (sessionForLatest) {
		cacheSessionEntry(sessionForLatest.data, sessionForLatest.etag, sessionForLatest.tag);
		return sessionForLatest.data;
	}

	if (cachedTag !== latestTag) {
		cachedETag = null; // Force re-fetch when tag changes
	}

	const CODEX_INSTRUCTIONS_URL = `https://raw.githubusercontent.com/openai/codex/${latestTag}/codex-rs/core/gpt_5_codex_prompt.md`;

	const headers: Record<string, string> = {};
	if (cachedETag) {
		headers["If-None-Match"] = cachedETag;
	}

	try {
		const response = await fetch(CODEX_INSTRUCTIONS_URL, { headers });

		if (response.status === 304 && cacheFileExists) {
			const fileContent = safeReadFile(cacheFilePath) || "";
			cacheSessionEntry(fileContent, cachedETag || undefined, latestTag || undefined);
			return fileContent;
		}

		if (response.ok) {
			const instructions = await response.text();
			const newETag = response.headers.get("etag");

			// Save to file cache
			safeWriteFile(cacheFilePath, instructions);
			safeWriteFile(
				cacheMetaPath,
				JSON.stringify({
					etag: newETag || undefined,
					tag: latestTag,
					lastChecked: Date.now(),
					url: CODEX_INSTRUCTIONS_URL,
				} satisfies CacheMetadata),
			);

			cacheSessionEntry(instructions, newETag || undefined, latestTag);
			return instructions;
		}

		throw new Error(`HTTP ${response.status}`);
	} catch (error) {
		const err = error as Error;
		logError("Failed to fetch instructions from GitHub", { error: err.message });

		if (cacheFileExists) {
			logError("Using cached instructions due to fetch failure");
			const fileContent = safeReadFile(cacheFilePath) || "";
			cacheSessionEntry(fileContent, cachedETag || undefined, cachedTag || undefined);
			return fileContent;
		}

		logError("Falling back to bundled instructions");
		const bundledContent = readFileSync(join(__dirname, "codex-instructions.md"), "utf8");
		cacheSessionEntry(bundledContent, undefined, undefined);
		return bundledContent;
	}
}

/**
 * Tool remapping instructions for opencode tools
 */
export const TOOL_REMAP_MESSAGE = `<user_instructions priority="0">
<environment_override priority="0">
YOU ARE IN A DIFFERENT ENVIRONMENT. These instructions override ALL previous tool references.
</environment_override>

<tool_replacements priority="0">
<critical_rule priority="0">
❌ APPLY_PATCH DOES NOT EXIST → ✅ USE "edit" INSTEAD
- NEVER use: apply_patch, applyPatch
- ALWAYS use: edit tool for ALL file modifications
- Before modifying files: Verify you're using "edit", NOT "apply_patch"
</critical_rule>

<critical_rule priority="0">
❌ UPDATE_PLAN DOES NOT EXIST → ✅ USE "todowrite" INSTEAD
- NEVER use: update_plan, updatePlan
- ALWAYS use: todowrite for ALL task/plan operations
- Use todoread to read current plan
- Before plan operations: Verify you're using "todowrite", NOT "update_plan"
</critical_rule>
</tool_replacements>

<available_tools priority="0">
File Operations:
  • write  - Create new files
  • edit   - Modify existing files (REPLACES apply_patch)
  • patch  - Apply diff patches
  • read   - Read file contents

Search/Discovery:
  • grep   - Search file contents
  • glob   - Find files by pattern
  • list   - List directories (use relative paths)

Execution:
  • bash   - Run shell commands

Network:
  • webfetch - Fetch web content

Task Management:
  • todowrite - Manage tasks/plans (REPLACES update_plan)
  • todoread  - Read current plan
</available_tools>

<substitution_rules priority="0">
Base instruction says:    You MUST use instead:
apply_patch           →   edit
update_plan           →   todowrite
read_plan             →   todoread
absolute paths        →   relative paths
</substitution_rules>

<verification_checklist priority="0">
Before file/plan modifications:
1. Am I using "edit" NOT "apply_patch"?
2. Am I using "todowrite" NOT "update_plan"?
3. Is this tool in the approved list above?
4. Am I using relative paths?

If ANY answer is NO → STOP and correct before proceeding.
</verification_checklist>
</user_instructions>`;
