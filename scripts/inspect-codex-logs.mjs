#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DEFAULT_DIR = path.join(os.homedir(), ".opencode", "logs", "codex-plugin");

function getArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("-")) return true;
  return value;
}

function parseFilters() {
  return {
    dir: getArg("--dir", DEFAULT_DIR),
    limit: Number(getArg("--limit", 10)) || 10,
    id: getArg("--id", null),
    stage: getArg("--stage", null),
  };
}

function safeRoles(input) {
  if (!Array.isArray(input)) return [];
  const roles = new Set();
  for (const item of input) {
    if (item && typeof item.role === "string" && item.role.trim()) {
      roles.add(item.role.trim());
    }
  }
  return Array.from(roles);
}

function summarizeStage(stage, data) {
  const body = data.body || {};
  const model = data.model || data.normalizedModel || body.model || data.originalModel;
  const promptCacheKey = body.prompt_cache_key || body.promptCacheKey;
  const inputLength = Array.isArray(body.input) ? body.input.length : data.inputLength;
  const roles = safeRoles(body.input);
  const reasoning = body.reasoning || data.reasoning || {};
  const include = body.include || data.include;
  return {
    stage,
    timestamp: data.timestamp,
    model,
    originalModel: data.originalModel,
    promptCacheKey,
    inputLength,
    roles,
    reasoning,
    textVerbosity: body.text?.verbosity || data.textVerbosity,
    include,
    usage: data.usage,
  };
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function collectLogs(dir, stageFilter, idFilter, limit) {
  const entries = await readdir(dir);
  const pattern = /^request-(\d+)-(.+)\.json$/;
  const requests = new Map();

  for (const entry of entries) {
    const match = entry.match(pattern);
    if (!match) continue;
    const [, idStr, stage] = match;
    if (stageFilter && stage !== stageFilter) continue;
    if (idFilter && idStr !== String(idFilter)) continue;
    const id = Number(idStr);
    const filePath = path.join(dir, entry);
    const data = await readJson(filePath).catch(() => null);
    if (!data) continue;
    if (!requests.has(id)) {
      requests.set(id, []);
    }
    requests.get(id).push({ stage, data, filePath });
  }

  const ids = Array.from(requests.keys())
    .sort((a, b) => b - a)
    .slice(0, limit);
  return ids.map((id) => ({ id, stages: requests.get(id) || [] }));
}

function printSummary(requests) {
  for (const { id, stages } of requests) {
    console.log(`\n# Request ${id}`);
    for (const { stage, data, filePath } of stages.sort((a, b) => a.stage.localeCompare(b.stage))) {
      const summary = summarizeStage(stage, data);
      console.log(`- stage: ${summary.stage} (${filePath})`);
      console.log(`  timestamp: ${summary.timestamp || "n/a"}`);
      console.log(
        `  model: ${summary.model || "n/a"}${summary.originalModel ? ` (orig ${summary.originalModel})` : ""}`,
      );
      console.log(`  prompt_cache_key: ${summary.promptCacheKey || "n/a"}`);
      console.log(`  inputLength: ${summary.inputLength ?? "n/a"}`);
      if (summary.roles.length) {
        console.log(`  roles: ${summary.roles.join(", ")}`);
      }
      if (summary.reasoning?.effort || summary.reasoning?.summary) {
        console.log(
          `  reasoning: effort=${summary.reasoning.effort || "?"}, summary=${summary.reasoning.summary || "?"}`,
        );
      }
      if (summary.textVerbosity) {
        console.log(`  text verbosity: ${summary.textVerbosity}`);
      }
      if (Array.isArray(summary.include)) {
        console.log(`  include: ${summary.include.join(", ")}`);
      }
      if (summary.usage?.cached_tokens !== undefined) {
        console.log(`  cached_tokens: ${summary.usage.cached_tokens}`);
      }
    }
  }
}

async function main() {
  const { dir, limit, id, stage } = parseFilters();
  try {
    const requests = await collectLogs(dir, stage, id, limit);
    if (requests.length === 0) {
      console.log("No request logs found.");
      return;
    }
    printSummary(requests);
  } catch (error) {
    console.error(`Failed to process logs: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
