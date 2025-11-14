#!/usr/bin/env node
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function readEvent() {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) {
		throw new Error("GITHUB_EVENT_PATH is not defined");
	}
	const raw = readFileSync(eventPath, "utf8");
	return JSON.parse(raw);
}

function execOrEmpty(command) {
	try {
		return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	} catch (_error) {
		return "";
	}
}

function clamp(text, max = 12000) {
	if (!text) return "";
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n... (truncated, original length ${text.length})`;
}

function main() {
	const event = readEvent();
	const pr = event.pull_request;
	const comment = event.comment;
	if (!pr || !comment) {
		throw new Error("This script expects a pull_request_review_comment event");
	}

	const filePath = comment.path;
	const reviewer = comment.user?.login ?? "unknown";
	const branchSlug = `review/comment-${comment.id}`;
	const prNumber = pr.number;
	const prTitle = pr.title ?? "";
	const baseRef = pr.base?.ref ?? "main";
	const baseSha = pr.base?.sha ?? "";
	const headRef = pr.head?.ref ?? "";
	const headSha = pr.head?.sha ?? "";
	const commentUrl = comment.html_url ?? "";

	const fileDiff = clamp(execOrEmpty(`git diff ${baseSha}...${headSha} -- ${filePath}`));
	const fileContent = clamp(execOrEmpty(`git show ${headSha}:${filePath}`), 8000);
	const diffHunk = clamp(comment.diff_hunk ?? "", 6000);

	const lines = [
		`# Review Comment Context`,
		`- PR: #${prNumber} — ${prTitle}`,
		`- Base Branch: ${baseRef}`,
		`- Head Branch: ${headRef}`,
		`- File: ${filePath}`,
		`- Reviewer: ${reviewer}`,
		`- Comment URL: ${commentUrl}`,
		`- Comment ID: ${comment.id}`,
		`- Generated: ${new Date().toISOString()}`,
		"",
		"## Comment Body",
		comment.body?.trim() || "(empty comment)",
		"",
		"## Diff Hunk",
		"```diff",
		diffHunk || "(diff unavailable)",
		"```",
		"",
		"## Full File Diff",
		"```diff",
		fileDiff || "(file diff unavailable)",
		"```",
		"",
		"## Latest File Snapshot",
		"```",
		fileContent || "(file content unavailable)",
		"```",
		"",
		"## Required Actions",
		"1. Resolve the review comment precisely; avoid unrelated edits.",
		"2. Keep changes minimal and follow repository conventions.",
		"3. Leave the working tree ready for a single commit.",
		`4. Target branch: ${baseRef}.`,
	];

	mkdirSync(path.dirname("review-context.md"), { recursive: true });
	writeFileSync("review-context.md", lines.join("\n"));

	const outputEntries = {
		branch_name: branchSlug,
		base_ref: baseRef,
		base_sha: baseSha,
		head_ref: headRef,
		head_sha: headSha,
		comment_id: comment.id,
		comment_url: commentUrl,
		pr_number: prNumber,
		reviewer,
		file_path: filePath,
	};

	const outputPath = process.env.GITHUB_OUTPUT;
	if (outputPath) {
		const buffer = Object.entries(outputEntries)
			.map(([key, value]) => `${key}=${value}`)
			.join("\n");
		execSync(`cat >> ${outputPath}`, { input: `${buffer}\n`, encoding: "utf8" });
	}
}

main();
