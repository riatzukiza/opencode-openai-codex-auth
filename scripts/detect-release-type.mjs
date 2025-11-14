#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function run(command) {
	return execSync(command, { encoding: "utf8" }).trim();
}

function tryRun(command) {
	try {
		return run(command);
	} catch (_error) {
		return "";
	}
}

function getBaseRef() {
	if (process.env.RELEASE_BASE_REF) {
		return process.env.RELEASE_BASE_REF;
	}
	const described = tryRun("git describe --tags --abbrev=0");
	if (described) {
		return described;
	}
	return "";
}

function getHeadRef() {
	return process.env.GITHUB_SHA || tryRun("git rev-parse HEAD") || "HEAD";
}

function getInitialCommit() {
	return tryRun("git rev-list --max-parents=0 HEAD");
}

function collectCommits(range) {
	const rangeArg = range ? `${range} ` : "";
	const raw = tryRun(`git log ${rangeArg}--no-merges --pretty=format:%h%x09%s --max-count=50`);
	if (!raw) {
		return [];
	}
	return raw
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [hash, subject] = line.split("\t");
			return `- ${hash ?? ""} ${subject ?? ""}`.trim();
		});
}

function collectDiffStats(range) {
	if (!range) {
		const root = getInitialCommit();
		if (!root) {
			return "";
		}
		range = `${root} ${getHeadRef()}`;
	}
	const parts = range.split(" ");
	if (parts.length === 1) {
		return tryRun(`git diff --stat ${parts[0]}`);
	}
	return tryRun(`git diff --stat ${parts[0]} ${parts[1]}`);
}

function readPackageVersion() {
	const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
	return pkg.version ?? "0.0.0";
}

function bumpVersion(current, releaseType) {
	const [major = 0, minor = 0, patch = 0] = current
		.split(".")
		.map((value) => Number.parseInt(value, 10))
		.map((value) => (Number.isFinite(value) ? value : 0));
	if (releaseType === "major") {
		return `${major + 1}.0.0`;
	}
	if (releaseType === "minor") {
		return `${major}.${minor + 1}.0`;
	}
	return `${major}.${minor}.${patch + 1}`;
}

function parseArgs(argv) {
	const result = {};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--output" && argv[index + 1]) {
			result.output = argv[index + 1];
			index += 1;
		}
	}
	return result;
}

function extractAssistantText(response) {
	const output = Array.isArray(response.output) ? response.output : [];
	for (const item of output) {
		if (!item || item.type !== "message" || item.role !== "assistant") {
			continue;
		}
		const parts = Array.isArray(item.content) ? item.content : [];
		return parts
			.map((part) => {
				if (!part || typeof part !== "object") return "";
				if (part.type === "output_text" && typeof part.text === "string") {
					return part.text;
				}
				if (part.type === "input_text" && typeof part.text === "string") {
					return part.text;
				}
				if ("text" in part && typeof part.text === "string") {
					return part.text;
				}
				return "";
			})
			.filter(Boolean)
			.join("\n")
			.trim();
	}
	return "";
}

async function callOpencodeModel(systemPrompt, userPrompt) {
	const apiKey = process.env.OPENCODE_API_KEY;
	if (!apiKey) {
		throw new Error("OPENCODE_API_KEY is not configured");
	}
	const url = process.env.OPENCODE_API_URL || "https://api.openai.com/v1/responses";
	const schema = {
		name: "release_version",
		schema: {
			type: "object",
			additionalProperties: false,
			properties: {
				releaseType: { type: "string", enum: ["major", "minor", "patch"] },
				reasoning: { type: "string" },
				highlights: {
					type: "array",
					items: { type: "string" },
					default: [],
				},
				breakingChanges: {
					type: "array",
					items: { type: "string" },
					default: [],
				},
			},
			required: ["releaseType", "reasoning"],
		},
	};
	const body = {
		model: "opencode/gpt-5-nano",
		response_format: { type: "json_schema", json_schema: schema },
		input: [
			{
				role: "system",
				content: [{ type: "input_text", text: systemPrompt }],
			},
			{
				role: "user",
				content: [{ type: "input_text", text: userPrompt }],
			},
		],
	};
	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const errorBody = await response.text().catch(() => "");
		throw new Error(`Opencode request failed: ${response.status} ${response.statusText} ${errorBody}`);
	}
	const data = await response.json();
	const text = extractAssistantText(data);
	if (!text) {
		throw new Error("Empty assistant response from opencode analyzer");
	}
	return JSON.parse(text);
}

function formatReleaseNotes(result) {
	const lines = ["## Summary", result.summary || result.reasoning || "Automated release", ""];
	lines.push("### Release Type");
	lines.push(`- ${result.releaseType.toUpperCase()} (auto-detected)`);
	if (result.highlights?.length) {
		lines.push("", "### Highlights");
		for (const note of result.highlights) {
			lines.push(`- ${note}`);
		}
	}
	if (result.breakingChanges?.length) {
		lines.push("", "### Breaking Changes");
		for (const note of result.breakingChanges) {
			lines.push(`- ${note}`);
		}
	}
	return lines.join("\n").trim();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const baseRef = getBaseRef();
	const headRef = getHeadRef();
	const range = baseRef ? `${baseRef}..${headRef}` : "";
	const commits = collectCommits(range);
	const diffSummary = collectDiffStats(range || headRef);
	const hasChanges = commits.length > 0 || Boolean(diffSummary);
	const systemPrompt = "You are a release manager that classifies semantic version bumps.";
	const lines = [
		`Base ref: ${baseRef || "<first release>"}`,
		`Head ref: ${headRef}`,
		`Commit count (max 50 shown): ${commits.length}`,
		"",
		"## Commits",
		commits.length ? commits.join("\n") : "(No commits detected)",
		"",
		"## Diff Summary",
		diffSummary || "(Diff summary unavailable)",
	];
	const userPrompt = lines.join("\n");
	const fallback = {
		releaseType: "patch",
		reasoning: hasChanges
			? "Fallback to patch because analyzer input could not be classified"
			: "No relevant commits detected, defaulting to patch",
		highlights: commits.slice(0, 5).map((line) => line.replace(/^-\s*/, "")),
		breakingChanges: [],
	};
	let analysis;
	try {
		analysis = await callOpencodeModel(systemPrompt, userPrompt);
	} catch (error) {
		console.error(`[release] Falling back to patch bump: ${error.message}`);
		analysis = fallback;
	}
	const currentVersion = readPackageVersion();
	const releaseType = analysis.releaseType ?? "patch";
	const nextVersion = bumpVersion(currentVersion, releaseType);
	const summary = analysis.reasoning ?? fallback.reasoning;
	const highlights = Array.isArray(analysis.highlights) ? analysis.highlights : fallback.highlights;
	const breakingChanges = Array.isArray(analysis.breakingChanges)
		? analysis.breakingChanges
		: fallback.breakingChanges;
	const releaseNotes = formatReleaseNotes({
		summary,
		reasoning: summary,
		releaseType,
		highlights,
		breakingChanges,
	});
	const result = {
		baseRef: baseRef || null,
		headRef,
		releaseType,
		nextVersion,
		summary,
		highlights,
		breakingChanges,
		releaseNotes,
	};
	if (args.output) {
		writeFileSync(args.output, JSON.stringify(result, null, 2));
	}
	console.log(JSON.stringify(result, null, 2));
}

await main();
