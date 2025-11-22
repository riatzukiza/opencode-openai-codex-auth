import { describe, it, expect, vi, afterEach } from "vitest";
import { transformRequestForCodex } from "../lib/request/fetch-helpers.js";
import { SessionManager } from "../lib/session/session-manager.js";
import * as openCodeCodex from "../lib/prompts/opencode-codex.js";
import type { InputItem, PluginConfig, RequestBody, UserConfig } from "../lib/types.js";
import * as logger from "../lib/logger.js";

const CODEX_INSTRUCTIONS = "codex instructions";
const USER_CONFIG: UserConfig = { global: {}, models: {} };
const API_URL = "https://api.openai.com/v1/responses";

function envMessage(date: string, files: string[]): InputItem {
	return {
		type: "message",
		role: "developer",
		content: [
			{
				type: "input_text",
				text: [
					"Here is some useful information about the environment you are running in:",
					"<env>",
					`  Today's date: ${date}`,
					"</env>",
					"<files>",
					...files.map((f) => `  ${f}`),
					"</files>",
				].join("\n"),
			},
		],
	};
}

async function runTransform(
	body: RequestBody,
	sessionManager: SessionManager,
	pluginConfig: PluginConfig = { appendEnvContext: false },
) {
	const init: RequestInit = { body: JSON.stringify(body) };
	const result = await transformRequestForCodex(
		init,
		API_URL,
		CODEX_INSTRUCTIONS,
		USER_CONFIG,
		true,
		sessionManager,
		pluginConfig,
	);
	if (!result) throw new Error("transformRequestForCodex returned undefined");
	return result;
}

describe("cache e2e without hitting Codex", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("keeps prompt_cache_key stable when env/files churn across turns", async () => {
		// Avoid network in filterOpenCodeSystemPrompts
		vi.spyOn(openCodeCodex, "getOpenCodeCodexPrompt").mockResolvedValue(
			"You are a coding agent running in OpenCode",
		);

		const manager = new SessionManager({ enabled: true });

		const body1: RequestBody = {
			model: "gpt-5",
			metadata: { conversation_id: "conv-env-e2e" },
			input: [
				envMessage("Mon Jan 01 2024", ["README.md", "dist/index.js"]),
				{ type: "message", role: "user", content: "hello" },
			],
		};

		const res1 = await runTransform(body1, manager);
		const transformed1 = res1.body as RequestBody;
		expect(transformed1.prompt_cache_key).toContain("conv-env-e2e");
		expect(transformed1.input).toHaveLength(1);
		expect(transformed1.input?.[0].role).toBe("user");

		const body2: RequestBody = {
			model: "gpt-5",
			metadata: { conversation_id: "conv-env-e2e" },
			input: [
				envMessage("Tue Jan 02 2024", ["README.md", "dist/main.js", "coverage/index.html"]),
				{ type: "message", role: "user", content: "hello" },
			],
		};

		const res2 = await runTransform(body2, manager);
		const transformed2 = res2.body as RequestBody;
		expect(transformed2.prompt_cache_key).toBe(transformed1.prompt_cache_key);
		expect(transformed2.input).toHaveLength(1);
		expect(transformed2.input?.[0].role).toBe("user");
	});

	it("logs user_message_changed when only user content changes", async () => {
		vi.spyOn(openCodeCodex, "getOpenCodeCodexPrompt").mockResolvedValue(
			"You are a coding agent running in OpenCode",
		);
		const warnSpy = vi.spyOn(logger, "logWarn").mockImplementation(() => {});
		const manager = new SessionManager({ enabled: true });

		const body1: RequestBody = {
			model: "gpt-5",
			metadata: { conversation_id: "conv-user-e2e" },
			input: [{ type: "message", role: "user", content: "hello" }],
		};
		await runTransform(body1, manager);

		const body2: RequestBody = {
			model: "gpt-5",
			metadata: { conversation_id: "conv-user-e2e" },
			input: [{ type: "message", role: "user", content: "second" }],
		};
		await runTransform(body2, manager);

		const warnCall = warnSpy.mock.calls.find(
			([message]) => typeof message === "string" && message.includes("prefix mismatch"),
		);
		expect(warnCall?.[1]).toMatchObject({
			prefixCause: "user_message_changed",
			previousRole: "user",
			incomingRole: "user",
		});
	});
});
