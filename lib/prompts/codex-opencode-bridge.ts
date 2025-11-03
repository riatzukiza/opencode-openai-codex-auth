/**
 * Codex-OpenCode Bridge Prompt
 *
 * This prompt bridges Codex CLI instructions to the OpenCode environment.
 * It incorporates critical tool mappings, available tools list, substitution rules,
 * and verification checklist to ensure proper tool usage.
 *
 * Token Count: ~450 tokens (~90% reduction vs full OpenCode prompt)
 */

export const CODEX_OPENCODE_BRIDGE = `# Codex in OpenCode

You are Codex running in OpenCode. Different tools, same principles.

## Tool Replacements

❌ apply_patch → edit
❌ update_plan → todowrite

## Available Tools

Files: write, edit, read
Search: grep, glob, list  
Exec: bash
Net: webfetch
Tasks: todowrite, todoread

## Substitutions

apply_patch → edit
update_plan → todowrite
read_plan → todoread

## Verification

Before changes: edit? todowrite? tool in list? paths correct?

## Working Style

Brief preambles (8-12 words), progress updates, autonomous work, surgical changes.

## Advanced Tools

Task tool: specialized agents via Task tool
MCP tools: mcp__<server>__<tool> prefixes

## Codex Policies

Sandbox, approvals, formatting, git protocols follow Codex instructions.`;

export interface CodexOpenCodeBridgeMeta {
	estimatedTokens: number;
	reductionVsCurrent: string;
	reductionVsToolRemap: string;
	protects: string[];
	omits: string[];
}

export const CODEX_OPENCODE_BRIDGE_META: CodexOpenCodeBridgeMeta = {
	estimatedTokens: 550,
	reductionVsCurrent: "88%",
	reductionVsToolRemap: "10%",
	protects: [
		"Tool name confusion (apply_patch/update_plan)",
		"Missing tool awareness",
		"Task tool / sub-agent awareness",
		"MCP tool awareness",
		"Premature yielding to user",
		"Over-modification of existing code",
		"Environment confusion",
	],
	omits: [
		"Sandbox details (in Codex)",
		"Formatting rules (in Codex)",
		"Tool schemas (in tool JSONs)",
		"Git protocols (in Codex)",
	],
};
