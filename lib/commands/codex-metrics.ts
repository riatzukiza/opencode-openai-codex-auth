import { randomUUID } from "node:crypto";
import { getCachePerformanceReport } from "../cache/cache-metrics.js";
import { getCacheWarmSnapshot, type CacheWarmSnapshot } from "../cache/cache-warming.js";
import type { RequestBody } from "../types.js";
import type { SessionManager, SessionMetricsSnapshot } from "../session/session-manager.js";

interface CommandOptions {
	sessionManager?: SessionManager;
}

interface MetricsMetadata {
	command: string;
	cacheReport: ReturnType<typeof getCachePerformanceReport>;
	promptCache: SessionMetricsSnapshot;
	cacheWarmStatus: CacheWarmSnapshot;
}

const COMMAND_NAME = "/codex-metrics";

export function maybeHandleCodexCommand(
	body: RequestBody,
	opts: CommandOptions = {},
): Response | undefined {
	const latestUserText = extractLatestUserText(body);
	if (!latestUserText || !isCodexMetricsCommand(latestUserText)) {
		return undefined;
	}

	const cacheReport = getCachePerformanceReport();
	const promptCache = opts.sessionManager?.getMetrics?.() ?? createEmptySessionMetrics();
	const warmStatus = getCacheWarmSnapshot();
	const message = formatMetricsDisplay(cacheReport, promptCache, warmStatus);

	const metadata: MetricsMetadata = {
		command: COMMAND_NAME.slice(1),
		cacheReport,
		promptCache,
		cacheWarmStatus: warmStatus,
	};

	return createStaticResponse(body.model, message, metadata);
}

function createStaticResponse(
	model: string | undefined,
	text: string,
	metadata: MetricsMetadata,
): Response {
	const outputTokens = estimateTokenCount(text);
	const responsePayload = {
		id: `resp_cmd_${randomUUID()}`,
		object: "response",
		created: Math.floor(Date.now() / 1000),
		model: model || "gpt-5",
		status: "completed",
		usage: {
			input_tokens: 0,
			output_tokens: outputTokens,
			reasoning_tokens: 0,
			total_tokens: outputTokens,
		},
		output: [
			{
				id: `msg_cmd_${randomUUID()}`,
				type: "message",
				role: "assistant",
				content: [
					{
						type: "output_text",
						text,
					},
				],
				metadata: {
					source: COMMAND_NAME,
				},
			},
		],
		metadata,
	};

	return new Response(JSON.stringify(responsePayload), {
		status: 200,
		headers: {
			"content-type": "application/json; charset=utf-8",
		},
	});
}

function extractLatestUserText(body: RequestBody): string | null {
	if (!Array.isArray(body.input)) {
		return null;
	}

	for (let index = body.input.length - 1; index >= 0; index -= 1) {
		const item = body.input[index];
		if (!item || item.role !== "user") {
			continue;
		}

		const content = normalizeContent(item.content);
		if (content) {
			return content;
		}
	}

	return null;
}

function normalizeContent(content: unknown): string | null {
	if (!content) {
		return null;
	}
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		const textParts = content
			.filter((part) =>
				part && typeof part === "object" && "type" in part && (part as { type: string }).type === "input_text",
			)
			.map((part) => ((part as { text?: string }).text ?? ""))
			.filter(Boolean);
		return textParts.length > 0 ? textParts.join("\n") : null;
	}
	return null;
}

function isCodexMetricsCommand(text: string): boolean {
	const normalized = text.trim().toLowerCase();
	return normalized === COMMAND_NAME || normalized.startsWith(`${COMMAND_NAME} `);
}

function estimateTokenCount(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

function formatMetricsDisplay(
	report: ReturnType<typeof getCachePerformanceReport>,
	promptCache: SessionMetricsSnapshot,
	warmStatus: CacheWarmSnapshot,
): string {
	const timestamp = new Date().toISOString();
	const lines: string[] = [];
	lines.push(`Codex Metrics — ${timestamp}`);
	lines.push("");

	lines.push("Cache Performance");
	lines.push(`- Summary: ${report.summary}`);
	for (const [name, metrics] of Object.entries(report.details)) {
		lines.push(
			`- ${name}: ${metrics.hits}/${metrics.totalRequests} hits (${metrics.hitRate.toFixed(1)}% hit rate, ${metrics.evictions} evictions)`,
		);
	}
	if (report.recommendations.length > 0) {
		lines.push("- Recommendations:");
		report.recommendations.forEach((rec) => lines.push(`  • ${rec}`));
	}

	lines.push("");
	lines.push("Prompt Cache");
	lines.push(`- Enabled: ${promptCache.enabled ? "yes" : "no"}`);
	lines.push(`- Sessions tracked: ${promptCache.totalSessions}`);
	if (promptCache.recentSessions.length === 0) {
		lines.push("- Recent sessions: none");
	} else {
		lines.push("- Recent sessions:");
		for (const session of promptCache.recentSessions) {
			const cached = session.lastCachedTokens ?? 0;
			lines.push(
				`  • ${session.id} → ${session.promptCacheKey} (cached=${cached}, updated=${new Date(
					session.lastUpdated,
				).toISOString()})`,
			);
		}
	}

	lines.push("");
	lines.push("Cache Warmth");
	lines.push(`- Codex instructions warm: ${warmStatus.codexInstructions ? "yes" : "no"}`);
	lines.push(`- OpenCode prompt warm: ${warmStatus.opencodePrompt ? "yes" : "no"}`);

	return lines.join("\n");
}

function createEmptySessionMetrics(): SessionMetricsSnapshot {
	return {
		enabled: false,
		totalSessions: 0,
		recentSessions: [],
	};
}
