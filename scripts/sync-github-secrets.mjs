#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import process from "node:process";

const defaultSecrets = [
	{ name: "NPM_TOKEN", optional: false },
	{ name: "OPENCODE_API_KEY", optional: false },
	{ name: "OPENCODE_API_URL", optional: true },
	{ name: "RELEASE_BASE_REF", optional: true },
];

function printUsage() {
	console.log(`Usage: pnpm sync:secrets [--repo owner/repo] [--dry-run] [SECRET ...]

Sync selected environment variables to GitHub repository secrets via the gh CLI.

Options:
  --repo <owner/repo>  Override repository target (default: infer from GITHUB_REPOSITORY or git remote origin)
  --dry-run            Show which secrets would be synced without calling gh
  --help               Show this message

Arguments:
  SECRET               Optional list of env var names to sync. When omitted, the default set (${defaultSecrets
		.map((item) => item.name)
		.join(", ")}) is used.
`);
}

function parseArgs(argv) {
	const result = { repo: undefined, dryRun: false, secrets: [] };
	const args = [...argv];
	while (args.length) {
		const arg = args.shift();
		if (arg === "--repo" && args.length) {
			result.repo = args.shift();
		} else if (arg === "--dry-run") {
			result.dryRun = true;
		} else if (arg === "--help") {
			printUsage();
			process.exit(0);
		} else if (arg?.startsWith("--")) {
			console.error(`Unknown option: ${arg}`);
			printUsage();
			process.exit(1);
		} else if (arg) {
			result.secrets.push(arg);
		}
	}
	return result;
}

function ensureGhAvailable() {
	const result = spawnSync("gh", ["--version"], { encoding: "utf8" });
	if (result.error || result.status !== 0) {
		throw new Error(
			"GitHub CLI (gh) is not available. Install it and authenticate before running this script.",
		);
	}
}

function detectRepo(explicitRepo) {
	if (explicitRepo) return explicitRepo;
	if (process.env.GITHUB_REPOSITORY) {
		return process.env.GITHUB_REPOSITORY;
	}
	try {
		const remoteUrl = execSync("git config --get remote.origin.url", { encoding: "utf8" }).trim();
		const match = /github\.com[:/](?<owner>[\w.-]+)\/(?<repo>[\w.-]+?)(?:\.git)?$/i.exec(remoteUrl);
		if (match?.groups?.owner && match?.groups?.repo) {
			const cleanRepo = match.groups.repo.replace(/\.git$/i, "");
			return `${match.groups.owner}/${cleanRepo}`;
		}
	} catch (error) {
		throw new Error(`Unable to infer repository: ${error.message}`);
	}
	throw new Error(
		"Could not determine GitHub repository. Pass --repo owner/repo or set the GITHUB_REPOSITORY env variable.",
	);
}

function gatherSecrets(customNames) {
	if (customNames.length > 0) {
		return customNames.map((name) => ({ name, optional: false }));
	}
	return defaultSecrets;
}

function syncSecret({ name, value, repo, dryRun }) {
	if (dryRun) {
		console.log(`[dry-run] gh secret set ${name} --repo ${repo}`);
		return;
	}
	const command = spawnSync("gh", ["secret", "set", name, "--repo", repo, "--body", value], {
		encoding: "utf8",
		stdio: ["inherit", "inherit", "inherit"],
	});
	if (command.status !== 0) {
		throw new Error(`gh secret set ${name} failed with exit code ${command.status}`);
	}
	console.log(`✔ Synced ${name}`);
}

function validateSecrets(requestedSecrets) {
	const prepared = [];
	for (const secret of requestedSecrets) {
		const value = process.env[secret.name];
		if (!value) {
			if (secret.optional) {
				console.warn(`Skipping optional secret ${secret.name} (env var not set)`);
				continue;
			}
			throw new Error(`Environment variable ${secret.name} is not set.`);
		}
		prepared.push({ name: secret.name, value });
	}
	if (prepared.length === 0) {
		throw new Error("No secrets to sync. Set the required environment variables or provide explicit names.");
	}
	return prepared;
}

async function main() {
	const parsed = parseArgs(process.argv.slice(2));
	ensureGhAvailable();
	const repo = detectRepo(parsed.repo);
	const requestedSecrets = gatherSecrets(parsed.secrets);
	const resolvedSecrets = validateSecrets(requestedSecrets);
	console.log(`Syncing ${resolvedSecrets.length} secret(s) to ${repo}...`);
	for (const secret of resolvedSecrets) {
		syncSecret({ name: secret.name, value: secret.value, repo, dryRun: parsed.dryRun });
	}
	console.log("Done.");
}

main().catch((error) => {
	console.error(`[sync-github-secrets] ${error.message}`);
	process.exit(1);
});
