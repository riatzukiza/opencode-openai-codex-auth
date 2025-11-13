import { beforeEach, describe, expect, it, vi } from "vitest";
import { isCodexResponsePayload, recordSessionResponseFromHandledResponse } from "../lib/session/response-recorder.js";
import type { SessionContext } from "../lib/types.js";
import type { SessionManager } from "../lib/session/session-manager.js";

const logDebugMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/logger.js", () => ({
	__esModule: true,
	logDebug: logDebugMock,
}));

function createSessionContext(): SessionContext {
	return {
		sessionId: "session-1",
		enabled: true,
		preserveIds: true,
		isNew: false,
		state: {
			id: "session-1",
			promptCacheKey: "cache-session-1",
			store: false,
			lastInput: [],
			lastPrefixHash: null,
			lastUpdated: Date.now(),
		},
	};
}

describe("recordSessionResponseFromHandledResponse", () => {
	const recordResponseMock = vi.fn();
	const sessionManager = {
		recordResponse: recordResponseMock,
	} as Pick<SessionManager, "recordResponse">;

	beforeEach(() => {
		recordResponseMock.mockClear();
		logDebugMock.mockClear();
	});

	it("records session usage for valid payloads", async () => {
		const sessionContext = createSessionContext();
		const payload = { usage: { cached_tokens: 42 } };
		const response = new Response(JSON.stringify(payload), {
			status: 200,
			headers: { "content-type": "application/json" },
		});

		await recordSessionResponseFromHandledResponse({
			sessionManager,
			sessionContext,
			handledResponse: response,
		});

		expect(recordResponseMock).toHaveBeenCalledWith(
			sessionContext,
			expect.objectContaining({
				usage: expect.objectContaining({ cached_tokens: 42 }),
			}),
		);
	});

	it("ignores payloads with non-object usage", async () => {
		const sessionContext = createSessionContext();
		const response = new Response(JSON.stringify({ usage: null }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});

		await recordSessionResponseFromHandledResponse({
			sessionManager,
			sessionContext,
			handledResponse: response,
		});

		expect(recordResponseMock).not.toHaveBeenCalled();
	});

	it("skips recording when content-type header is missing", async () => {
		const sessionContext = createSessionContext();
		const response = new Response(JSON.stringify({ usage: { cached_tokens: 10 } }), {
			status: 200,
		});
		response.headers.delete("content-type");

		await recordSessionResponseFromHandledResponse({
			sessionManager,
			sessionContext,
			handledResponse: response,
		});

		expect(recordResponseMock).not.toHaveBeenCalled();
	});
});

describe("isCodexResponsePayload", () => {

	it("returns false for null payloads", () => {
		expect(isCodexResponsePayload(null)).toBe(false);
		expect(isCodexResponsePayload(undefined)).toBe(false);
	});

	it("returns true when usage is omitted", () => {
		expect(isCodexResponsePayload({ id: "resp" })).toBe(true);
	});

	it("rejects non-object usage entries", () => {
		expect(isCodexResponsePayload({ usage: null })).toBe(false);
	});

	it("rejects non-numeric cached token fields", () => {
		expect(
			isCodexResponsePayload({ usage: { cached_tokens: "invalid" } }),
		).toBe(false);
	});

	it("accepts payloads with numeric cached tokens", () => {
		expect(
			isCodexResponsePayload({ usage: { cached_tokens: 10 } }),
		).toBe(true);
	});
});
