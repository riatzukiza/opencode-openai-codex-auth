import type { SessionManager } from "../session/session-manager.js";
import type { InputItem, SessionContext } from "../types.js";
import { createSummaryMessage } from "./codex-compaction.js";

export interface CompactionDecision {
	mode: "command" | "auto";
	reason?: string;
	approxTokens?: number;
	preservedSystem: InputItem[];
	serialization: {
		transcript: string;
		totalTurns: number;
		droppedTurns: number;
	};
}

interface FinalizeOptions {
	response: Response;
	decision: CompactionDecision;
	sessionManager?: SessionManager;
	sessionContext?: SessionContext;
}

export async function finalizeCompactionResponse({
	response,
	decision,
	sessionManager,
	sessionContext,
}: FinalizeOptions): Promise<Response> {
	const responseClone = response.clone();

	try {
		const text = await responseClone.text();
		const payload = JSON.parse(text) as any;
		const summaryText = extractFirstAssistantText(payload) ?? "(no summary provided)";
		const summaryMessage = createSummaryMessage(summaryText);
		const summaryContent = typeof summaryMessage.content === "string" ? summaryMessage.content : "";

		const metaNote =
			decision.mode === "auto"
				? `Auto compaction triggered (${decision.reason ?? "context limit"}). Review the summary below, then resend your last instruction.\n\n`
				: "";
		const finalText = `${metaNote}${summaryContent}`.trim();

		rewriteAssistantOutput(payload, finalText);
		payload.metadata = {
			...(payload.metadata ?? {}),
			codex_compaction: {
				mode: decision.mode,
				reason: decision.reason,
				dropped_turns: decision.serialization.droppedTurns,
				total_turns: decision.serialization.totalTurns,
			},
		};

		if (sessionManager && sessionContext) {
			sessionManager.applyCompactionSummary(sessionContext, {
				baseSystem: decision.preservedSystem,
				summary: summaryContent,
			});
		}

		const headers = new Headers(response.headers);
		return new Response(JSON.stringify(payload), {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	} catch {
		return response;
	}
}

function extractFirstAssistantText(payload: any): string | null {
	const output = Array.isArray(payload?.output) ? payload.output : [];
	for (const item of output) {
		if (item?.role !== "assistant") continue;
		const content = Array.isArray(item?.content) ? item.content : [];
		for (const part of content) {
			if (part?.type === "output_text" && typeof part.text === "string") {
				return part.text;
			}
		}
	}
	return null;
}

function rewriteAssistantOutput(payload: any, text: string): void {
	const output = Array.isArray(payload?.output) ? payload.output : [];
	for (const item of output) {
		if (item?.role !== "assistant") continue;
		const content = Array.isArray(item?.content) ? item.content : [];
		const firstText = content.find((part: any) => part?.type === "output_text");
		if (firstText) {
			firstText.text = text;
		}
		break;
	}
}
