import { randomUUID } from "node:crypto";
import { getCachePerformanceReport } from "../cache/cache-metrics.js";
import { getCacheWarmSnapshot, type CacheWarmSnapshot } from "../cache/cache-warming.js";
import type { RequestBody } from "../types.js";
import type { SessionManager, SessionMetricsSnapshot } from "../session/session-manager.js";

interface CommandOptions {
  sessionManager?: SessionManager;
}

interface MetricsMetadata {
  command: "codex-metrics";
  cacheReport: ReturnType<typeof getCachePerformanceReport>;
  promptCache: SessionMetricsSnapshot;
  cacheWarmStatus: CacheWarmSnapshot;
}

interface InspectMetadata {
  command: "codex-inspect";
  model: string | undefined;
  promptCacheKey?: string;
  hasTools: boolean;
  toolCount: number;
  hasReasoning: boolean;
  reasoningEffort?: string;
  reasoningSummary?: string;
  textVerbosity?: string;
  include?: string[];
}

type CommandMetadata = MetricsMetadata | InspectMetadata;

const METRICS_COMMAND = "codex-metrics";
const INSPECT_COMMAND = "codex-inspect";

export function maybeHandleCodexCommand(
  body: RequestBody,
  opts: CommandOptions = {},
): Response | undefined {
  const latestUserText = extractLatestUserText(body);
  if (!latestUserText) {
    return undefined;
  }

  const trigger = normalizeCommandTrigger(latestUserText);

  if (isMetricsTrigger(trigger)) {
    const cacheReport = getCachePerformanceReport();
    const promptCache = opts.sessionManager?.getMetrics?.() ?? createEmptySessionMetrics();
    const warmStatus = getCacheWarmSnapshot();
    const message = formatMetricsDisplay(cacheReport, promptCache, warmStatus);

    const metadata: MetricsMetadata = {
      command: METRICS_COMMAND,
      cacheReport,
      promptCache,
      cacheWarmStatus: warmStatus,
    };

    return createStaticResponse(body.model, message, metadata);
  }

  if (isInspectTrigger(trigger)) {
    const bodyAny = body as Record<string, unknown>;
    const promptCacheKey =
      (bodyAny.prompt_cache_key as string | undefined) ||
      (bodyAny.promptCacheKey as string | undefined);
    const tools = Array.isArray(bodyAny.tools) ? (bodyAny.tools as unknown[]) : [];
    const hasTools = tools.length > 0;
    const reasoning = bodyAny.reasoning as { effort?: string; summary?: string } | undefined;
    const hasReasoning = !!reasoning && typeof reasoning === "object";
    const textConfig = bodyAny.text as { verbosity?: string } | undefined;
    const includeRaw = bodyAny.include as unknown;

    const include = Array.isArray(includeRaw)
      ? (includeRaw as unknown[]).filter((v): v is string => typeof v === "string")
      : undefined;

    const metadata: InspectMetadata = {
      command: INSPECT_COMMAND,
      model: body.model,
      promptCacheKey,
      hasTools,
      toolCount: tools.length,
      hasReasoning,
      reasoningEffort: hasReasoning ? reasoning?.effort : undefined,
      reasoningSummary: hasReasoning ? reasoning?.summary : undefined,
      textVerbosity: textConfig?.verbosity,
      include,
    };

    const message = formatInspectDisplay(metadata, body);
    return createStaticResponse(body.model, message, metadata);
  }

  return undefined;
}

function normalizeCommandTrigger(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();

  // Strip leading command prefix characters ("?" or "/") for matching.
  if (lower.startsWith("?") || lower.startsWith("/")) {
    return lower.slice(1).trimStart();
  }

  return lower;
}

function isMetricsTrigger(trigger: string): boolean {
  return (
    trigger === METRICS_COMMAND ||
    trigger.startsWith(METRICS_COMMAND + " ") ||
    trigger === "codexmetrics" ||
    trigger.startsWith("codexmetrics ")
  );
}

function isInspectTrigger(trigger: string): boolean {
  return (
    trigger === INSPECT_COMMAND ||
    trigger.startsWith(INSPECT_COMMAND + " ") ||
    trigger === "codexinspect" ||
    trigger.startsWith("codexinspect ")
  );
}

function createStaticResponse(
  model: string | undefined,
  text: string,
  metadata: CommandMetadata,
): Response {
  const outputTokens = estimateTokenCount(text);
  const commandName = metadata.command;
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
          source: commandName,
        },
      },
    ],
    metadata,
  };

  const stream = createSsePayload(responsePayload);
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

function createSsePayload(payload: Record<string, unknown>): string {
  const dataLine = `data: ${JSON.stringify(payload)}\n\n`;
  const doneLine = `data: [DONE]\n\n`;
  return dataLine + doneLine;
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
  lines.push("Codex Metrics -- " + timestamp);
  lines.push("");

  lines.push("Cache Performance");
  lines.push("- Summary: " + report.summary);
  for (const [name, metrics] of Object.entries(report.details)) {
    lines.push(
      "- " +
        name +
        ": " +
        metrics.hits +
        "/" +
        metrics.totalRequests +
        " hits (" +
        metrics.hitRate.toFixed(1) +
        "% hit rate, " +
        metrics.evictions +
        " evictions)",
    );
  }
  if (report.recommendations.length > 0) {
    lines.push("- Recommendations:");
    report.recommendations.forEach((rec) => lines.push("  - " + rec));
  }

  lines.push("");
  lines.push("Prompt Cache");
  lines.push("- Enabled: " + (promptCache.enabled ? "yes" : "no"));
  lines.push("- Sessions tracked: " + promptCache.totalSessions.toString());
  if (promptCache.recentSessions.length === 0) {
    lines.push("- Recent sessions: none");
  } else {
    lines.push("- Recent sessions:");
    for (const session of promptCache.recentSessions) {
      const cached = session.lastCachedTokens ?? 0;
      lines.push(
        "  - " +
          session.id +
          " -> " +
          session.promptCacheKey +
          " (cached=" +
          cached +
          ", updated=" +
          new Date(session.lastUpdated).toISOString() +
          ")",
      );
    }
  }

  lines.push("");
  lines.push("Cache Warmth");
  lines.push("- Codex instructions warm: " + (warmStatus.codexInstructions ? "yes" : "no"));
  lines.push("- OpenCode prompt warm: " + (warmStatus.opencodePrompt ? "yes" : "no"));

  return lines.join("\n");
}

function formatInspectDisplay(metadata: InspectMetadata, body: RequestBody): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [];
  lines.push("Codex Inspect -- " + timestamp);
  lines.push("");

  lines.push("Request");
  lines.push("- Model: " + (metadata.model ?? "(unset)"));
  lines.push("- Prompt cache key: " + (metadata.promptCacheKey ?? "(none)"));

  const inputCount = Array.isArray(body.input) ? body.input.length : 0;
  lines.push("- Input messages: " + inputCount.toString());

  lines.push("");
  lines.push("Tools");
  lines.push("- Has tools: " + (metadata.hasTools ? "yes" : "no"));
  lines.push("- Tool count: " + metadata.toolCount.toString());

  lines.push("");
  lines.push("Reasoning");
  lines.push("- Has reasoning: " + (metadata.hasReasoning ? "yes" : "no"));
  lines.push("- Effort: " + (metadata.reasoningEffort ?? "(unset)"));
  lines.push("- Summary: " + (metadata.reasoningSummary ?? "(unset)"));

  lines.push("");
  lines.push("Text");
  lines.push("- Verbosity: " + (metadata.textVerbosity ?? "(unset)"));

  lines.push("");
  lines.push("Include");
  if (!metadata.include || metadata.include.length === 0) {
    lines.push("- Include: (none)");
  } else {
    lines.push("- Include:");
    metadata.include.forEach((value) => {
      lines.push("  - " + value);
    });
  }

  return lines.join("\n");
}

function createEmptySessionMetrics(): SessionMetricsSnapshot {
  return {
    enabled: false,
    totalSessions: 0,
    recentSessions: [],
  };
}
