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

function readCacheMetadata(cacheMetaPath: string): CacheMetadata | null {
	const cachedMetaContent = safeReadFile(cacheMetaPath);
	if (!cachedMetaContent) return null;

	try {
		return JSON.parse(cachedMetaContent) as CacheMetadata;
	} catch {
		return null;
	}
}

function loadSessionFromMetadata(metadata: CacheMetadata | null): string | null {
	if (!metadata) return null;
	const cacheKeyFromMetadata = getCodexCacheKey(metadata.etag ?? undefined, metadata.tag ?? undefined);
	const sessionFromMetadata = codexInstructionsCache.get(cacheKeyFromMetadata);
	if (!sessionFromMetadata) return null;

	cacheSessionEntry(sessionFromMetadata.data, sessionFromMetadata.etag, sessionFromMetadata.tag);
	return sessionFromMetadata.data;
}

function cacheIsFresh(cachedTimestamp: number | null, cacheFileExists: boolean): boolean {
	return Boolean(cachedTimestamp && Date.now() - cachedTimestamp < CACHE_TTL_MS && cacheFileExists);
}

function readCachedInstructions(
	cacheFilePath: string,
	etag?: string | undefined,
	tag?: string | undefined,
): string {
	const fileContent = safeReadFile(cacheFilePath) || "";
	cacheSessionEntry(fileContent, etag, tag);
	return fileContent;
}

function loadBundledInstructions(): string {
	let bundledContent: string;
	try {
		bundledContent = readFileSync(join(__dirname, "codex-instructions.md"), "utf8");
	} catch (error) {
		logError("Failed to load bundled instructions", { error });
		throw new Error("Cannot load bundled Codex instructions; installation may be corrupted");
	}
	cacheSessionEntry(bundledContent, undefined, undefined);
	return bundledContent;
}

async function fetchInstructionsFromGithub(
	url: string,
	cacheFilePath: string,
	cacheMetaPath: string,
	cachedETag: string | null,
	latestTag: string,
	cacheFileExists: boolean,
): Promise<string> {
	const headers: Record<string, string> = {};
	if (cachedETag) {
		headers["If-None-Match"] = cachedETag;
	}

	const response = await fetch(url, { headers });

	if (response.status === 304 && cacheFileExists) {
		return readCachedInstructions(cacheFilePath, cachedETag || undefined, latestTag);
	}

	if (!response.ok) {
		throw new Error(`HTTP ${response.status} fetching ${url}`);
	}

	const instructions = await response.text();
	const newETag = response.headers.get("etag");

	safeWriteFile(cacheFilePath, instructions);
	safeWriteFile(
		cacheMetaPath,
		JSON.stringify({
			etag: newETag || undefined,
			tag: latestTag,
			lastChecked: Date.now(),
			url,
		} satisfies CacheMetadata),
	);

	cacheSessionEntry(instructions, newETag || undefined, latestTag);
	return instructions;
}

async function fetchInstructionsWithFallback(
	url: string,
	options: {
		cacheFilePath: string;
		cacheMetaPath: string;
		cacheFileExists: boolean;
		effectiveEtag: string | null;
		latestTag: string;
		cachedETag: string | null;
		cachedTag: string | null;
	},
): Promise<string> {
	try {
		return await fetchInstructionsFromGithub(
			url,
			options.cacheFilePath,
			options.cacheMetaPath,
			options.effectiveEtag,
			options.latestTag,
			options.cacheFileExists,
		);
	} catch (error) {
		const err = error as Error;
		logError("Failed to fetch instructions from GitHub", { error: err.message });

		if (options.cacheFileExists) {
			logWarn("Using cached instructions due to fetch failure");
			return readCachedInstructions(
				options.cacheFilePath,
				options.effectiveEtag || options.cachedETag || undefined,
				options.cachedTag || undefined,
			);
		}

		logWarn("Falling back to bundled instructions");
		return loadBundledInstructions();
	}
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

	const cacheMetaPath = getOpenCodePath("cache", CACHE_FILES.CODEX_INSTRUCTIONS_META);
	const cacheFilePath = getOpenCodePath("cache", CACHE_FILES.CODEX_INSTRUCTIONS);

	const metadata = readCacheMetadata(cacheMetaPath);
	const cachedETag = metadata?.etag || null;
	const cachedTag = metadata?.tag || null;
	const cachedTimestamp = metadata?.lastChecked || null;

	const sessionFromMetadata = loadSessionFromMetadata(metadata);
	if (sessionFromMetadata) {
		return sessionFromMetadata;
	}

	const cacheFileExists = fileExistsAndNotEmpty(cacheFilePath);
	if (cacheIsFresh(cachedTimestamp, cacheFileExists)) {
		return readCachedInstructions(cacheFilePath, cachedETag || undefined, cachedTag || undefined);
	}

	let latestTag: string | undefined;
	try {
		latestTag = await getLatestReleaseTag();
	} catch (error) {
		logWarn("Failed to get latest release tag; falling back to existing cache or bundled copy", {
			error,
		});
		if (cacheFileExists) {
			return readCachedInstructions(cacheFilePath, cachedETag || undefined, cachedTag || undefined);
		}
		return loadBundledInstructions();
	}

	if (!latestTag) {
		return loadBundledInstructions();
	}

	const resolvedTag = latestTag as string;
	const sessionForLatest = codexInstructionsCache.get(getCodexCacheKey(cachedETag ?? undefined, resolvedTag));
	if (sessionForLatest) {
		cacheSessionEntry(sessionForLatest.data, sessionForLatest.etag, sessionForLatest.tag);
		return sessionForLatest.data;
	}

	const effectiveEtag = cachedTag === resolvedTag ? cachedETag : null;
	const CODEX_INSTRUCTIONS_URL = `https://raw.githubusercontent.com/openai/codex/${resolvedTag}/codex-rs/core/gpt_5_codex_prompt.md`;

	return fetchInstructionsWithFallback(CODEX_INSTRUCTIONS_URL, {
		cacheFilePath,
		cacheMetaPath,
		cacheFileExists,
		effectiveEtag,
		latestTag: resolvedTag,
		cachedETag,
		cachedTag,
	});
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
