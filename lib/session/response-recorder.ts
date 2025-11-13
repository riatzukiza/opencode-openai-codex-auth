import { logDebug } from "../logger.js";
import type { CodexResponsePayload, SessionContext } from "../types.js";
import type { SessionManager } from "./session-manager.js";

export function isCodexResponsePayload(payload: unknown): payload is CodexResponsePayload {
	if (!payload || typeof payload !== "object") {
		return false;
	}

	const usage = (payload as { usage?: unknown }).usage;
	if (usage !== undefined && (usage === null || typeof usage !== "object")) {
		return false;
	}

	if (
		usage &&
		"cached_tokens" in (usage as Record<string, unknown>) &&
		typeof (usage as Record<string, unknown>).cached_tokens !== "number"
	) {
		return false;
	}

	return true;
}

export async function recordSessionResponseFromHandledResponse(options: {
	sessionManager: Pick<SessionManager, "recordResponse">;
	sessionContext: SessionContext | undefined;
	handledResponse: Response;
}): Promise<void> {
	const { sessionManager, sessionContext, handledResponse } = options;

	if (
		!sessionContext ||
		!handledResponse.headers.get("content-type")?.includes("application/json")
	) {
		return;
	}

	try {
		const payload = (await handledResponse.clone().json()) as unknown;
		if (isCodexResponsePayload(payload)) {
			sessionManager.recordResponse(sessionContext, payload);
		}
	} catch (error) {
		logDebug("SessionManager: failed to parse response payload", {
			error: (error as Error).message,
		});
	}
}
