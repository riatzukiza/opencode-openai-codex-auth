import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AUTHORIZE_URL,
	CLIENT_ID,
	createAuthorizationFlow,
	createState,
	decodeJWT,
	exchangeAuthorizationCode,
	parseAuthorizationInput,
	REDIRECT_URI,
	refreshAccessToken,
	SCOPE,
} from "../lib/auth/auth.js";

const fetchMock = vi.fn();

describe("Auth Module", () => {
	const originalConsoleError = console.error;

	beforeEach(() => {
		fetchMock.mockReset();
		global.fetch = fetchMock;
		console.error = vi.fn();
	});

	afterEach(() => {
		console.error = originalConsoleError;
	});

	describe("createState", () => {
		it("should generate a random 32-character hex string", () => {
			const state = createState();
			expect(state).toMatch(/^[a-f0-9]{32}$/);
		});

		it("should generate unique states", () => {
			const state1 = createState();
			const state2 = createState();
			expect(state1).not.toBe(state2);
		});
	});

	describe("parseAuthorizationInput", () => {
		it("should parse full OAuth callback URL", () => {
			const input = "http://localhost:1455/auth/callback?code=abc123&state=xyz789";
			const result = parseAuthorizationInput(input);
			expect(result).toEqual({ code: "abc123", state: "xyz789" });
		});

		it("should parse code#state format", () => {
			const input = "abc123#xyz789";
			const result = parseAuthorizationInput(input);
			expect(result).toEqual({ code: "abc123", state: "xyz789" });
		});

		it("should parse query string format", () => {
			const input = "code=abc123&state=xyz789";
			const result = parseAuthorizationInput(input);
			expect(result).toEqual({ code: "abc123", state: "xyz789" });
		});

		it("should parse code only", () => {
			const input = "abc123";
			const result = parseAuthorizationInput(input);
			expect(result).toEqual({ code: "abc123" });
		});

		it("should return empty object for empty input", () => {
			const result = parseAuthorizationInput("");
			expect(result).toEqual({});
		});

		it("should handle whitespace", () => {
			const result = parseAuthorizationInput("  ");
			expect(result).toEqual({});
		});
	});

	describe("decodeJWT", () => {
		it("should decode valid JWT token", () => {
			// Create a simple JWT token: header.payload.signature
			const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64");
			const payload = Buffer.from(JSON.stringify({ sub: "1234567890", name: "Test User" })).toString(
				"base64",
			);
			const signature = "fake-signature";
			const token = `${header}.${payload}.${signature}`;

			const decoded = decodeJWT(token);
			expect(decoded).toEqual({ sub: "1234567890", name: "Test User" });
		});

		it("should decode JWT with ChatGPT account info", () => {
			const payload = Buffer.from(
				JSON.stringify({
					"https://api.openai.com/auth": {
						chatgpt_account_id: "account-123",
					},
				}),
			).toString("base64");
			const token = `header.${payload}.signature`;

			const decoded = decodeJWT(token);
			expect(decoded?.["https://api.openai.com/auth"]?.chatgpt_account_id).toBe("account-123");
		});

		it("should return null for invalid JWT", () => {
			const result = decodeJWT("invalid-token");
			expect(result).toBeNull();
		});

		it("should return null for malformed JWT", () => {
			const result = decodeJWT("header.payload");
			expect(result).toBeNull();
		});

		it("should return null for 2-part token even if payload is valid JSON", () => {
			const payload = Buffer.from(JSON.stringify({ ok: true })).toString("base64");
			const token = `header.${payload}`; // only 2 parts
			const result = decodeJWT(token);
			expect(result).toBeNull();
		});

		it("should return null for non-JSON payload", () => {
			const token = "header.not-json.signature";
			const result = decodeJWT(token);
			expect(result).toBeNull();
		});
	});

	describe("createAuthorizationFlow", () => {
		it("should create authorization flow with PKCE", async () => {
			const flow = await createAuthorizationFlow();

			expect(flow).toHaveProperty("pkce");
			expect(flow).toHaveProperty("state");
			expect(flow).toHaveProperty("url");

			expect(flow.pkce).toHaveProperty("challenge");
			expect(flow.pkce).toHaveProperty("verifier");
			expect(flow.state).toMatch(/^[a-f0-9]{32}$/);
		});

		it("should generate URL with correct parameters", async () => {
			const flow = await createAuthorizationFlow();
			const url = new URL(flow.url);

			expect(url.origin + url.pathname).toBe(AUTHORIZE_URL);
			expect(url.searchParams.get("response_type")).toBe("code");
			expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
			expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT_URI);
			expect(url.searchParams.get("scope")).toBe(SCOPE);
			expect(url.searchParams.get("code_challenge_method")).toBe("S256");
			expect(url.searchParams.get("code_challenge")).toBe(flow.pkce.challenge);
			expect(url.searchParams.get("state")).toBe(flow.state);
			expect(url.searchParams.get("id_token_add_organizations")).toBe("true");
			expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
			expect(url.searchParams.get("originator")).toBe("codex_cli_rs");
		});

		it("should generate unique flows", async () => {
			const flow1 = await createAuthorizationFlow();
			const flow2 = await createAuthorizationFlow();

			expect(flow1.state).not.toBe(flow2.state);
			expect(flow1.pkce.verifier).not.toBe(flow2.pkce.verifier);
			expect(flow1.url).not.toBe(flow2.url);
		});
	});

	describe("exchangeAuthorizationCode", () => {
		it("returns success result on 200 response", async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						access_token: "access",
						refresh_token: "refresh",
						expires_in: 60,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			);

			const result = await exchangeAuthorizationCode("code", "verifier");
			expect(result.type).toBe("success");
			expect((result as any).access).toBe("access");
			expect((result as any).refresh).toBe("refresh");
			expect((result as any).expires).toBeGreaterThan(Date.now());
			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toBe("https://auth.openai.com/oauth/token");
			expect((init as RequestInit).method).toBe("POST");
			const headers = (init as RequestInit).headers as Record<string, string>;
			expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
			const body = new URLSearchParams((init as RequestInit).body as string);
			expect(body.get("grant_type")).toBe("authorization_code");
			expect(body.get("client_id")).toBe(CLIENT_ID);
			expect(body.get("redirect_uri")).toBe(REDIRECT_URI);
			expect(body.get("code")).toBe("code");
			expect(body.get("code_verifier")).toBe("verifier");
		});

		it("returns failed result on non-200 response", async () => {
			fetchMock.mockResolvedValueOnce(new Response("bad request", { status: 400 }));

			const result = await exchangeAuthorizationCode("code", "verifier");
			expect(result).toEqual({ type: "failed" });
			expect(console.error).toHaveBeenCalledWith(
				'[openhax/codex] Authorization code exchange failed {"status":400,"body":"bad request"}',
				"",
			);
		});

		it("logs empty body when text() throws on non-200", async () => {
			const badRes: any = {
				ok: false,
				status: 500,
				text: () => Promise.reject(new Error("boom")),
			};
			fetchMock.mockResolvedValueOnce(badRes);
			await exchangeAuthorizationCode("code", "verifier");
			expect(console.error).toHaveBeenCalledWith(
				'[openhax/codex] Authorization code exchange failed {"status":500,"body":""}',
				"",
			);
		});

		it("returns failed result when response missing fields", async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ access_token: "only-access" }), { status: 200 }),
			);

			const result = await exchangeAuthorizationCode("code", "verifier");
			expect(result).toEqual({ type: "failed" });
			expect(console.error).toHaveBeenCalledWith(
				'[openhax/codex] Token response missing fields {"access_token":"only-access"}',
				"",
			);
		});
	});

	describe("refreshAccessToken", () => {
		it("returns success when refresh succeeds", async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						access_token: "new-access",
						refresh_token: "new-refresh",
						expires_in: 120,
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			);

			const result = await refreshAccessToken("refresh-token");
			expect(result).toMatchObject({
				type: "success",
				access: "new-access",
				refresh: "new-refresh",
			});
			expect(result.expires).toBeGreaterThan(Date.now());
			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toBe("https://auth.openai.com/oauth/token");
			expect((init as RequestInit).method).toBe("POST");
			const headers = (init as RequestInit).headers as Record<string, string>;
			expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
			const body = new URLSearchParams((init as RequestInit).body as string);
			expect(body.get("grant_type")).toBe("refresh_token");
			expect(body.get("refresh_token")).toBe("refresh-token");
			expect(body.get("client_id")).toBe(CLIENT_ID);
		});

		it("logs and returns failed when refresh request fails", async () => {
			fetchMock.mockResolvedValueOnce(new Response("denied", { status: 401 }));
			const result = await refreshAccessToken("refresh-token");
			expect(result).toEqual({ type: "failed" });
			expect(console.error).toHaveBeenCalledWith(
				'[openhax/codex] Token refresh failed {"status":401,"body":"denied"}',
				"",
			);
		});

		it("handles network error by returning failed result", async () => {
			fetchMock.mockRejectedValueOnce(new Error("network down"));
			const result = await refreshAccessToken("refresh-token");
			expect(result).toEqual({ type: "failed" });
			expect(console.error).toHaveBeenCalledWith(
				'[openhax/codex] Token refresh error {"error":"network down"}',
				"",
			);
		});

		it("logs empty body when text() throws on non-200", async () => {
			const badRes: any = {
				ok: false,
				status: 403,
				text: () => Promise.reject(new Error("boom")),
			};
			fetchMock.mockResolvedValueOnce(badRes);
			await refreshAccessToken("refresh-token");
			expect(console.error).toHaveBeenCalledWith(
				'[openhax/codex] Token refresh failed {"status":403,"body":""}',
				"",
			);
		});

		it("returns failed when response missing fields (200 but invalid)", async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ access_token: "only" }), { status: 200 }),
			);
			const result = await refreshAccessToken("refresh-token");
			expect(result).toEqual({ type: "failed" });
			expect(console.error).toHaveBeenCalledWith(
				'[openhax/codex] Token refresh response missing fields {"access_token":"only"}',
				"",
			);
		});
	});

	it("Auth constants have expected defaults", () => {
		expect(AUTHORIZE_URL).toBe("https://auth.openai.com/oauth/authorize");
		expect(CLIENT_ID).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
		expect(REDIRECT_URI).toBe("http://localhost:1455/auth/callback");
		expect(SCOPE).toBe("openid profile email offline_access");
	});
});
