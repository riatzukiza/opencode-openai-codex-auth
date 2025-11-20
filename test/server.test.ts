import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockResponse {
	statusCode = 200;
	headers = new Map<string, string>();
	body = "";

	writeHead(status: number, headers?: Record<string, string>) {
		this.statusCode = status;
		if (headers) {
			for (const [key, value] of Object.entries(headers)) {
				this.headers.set(key, value);
			}
		}
		return this;
	}

	setHeader(key: string, value: string) {
		this.headers.set(key, value);
	}

	end(data?: string) {
		this.body = data ?? "";
	}
}

class MockServer {
	public handler: (req: { url?: string }, res: MockResponse) => void;
	public _lastCode?: string;
	private errorHandler: ((err: Error) => void) | null = null;
	public closed = false;

	constructor(handler: (req: { url?: string }, res: MockResponse) => void) {
		this.handler = handler;
	}

	listen(_port: number, _host: string, callback: () => void) {
		callback();
		return this;
	}

	on(event: string, cb: (err: Error) => void) {
		if (event === "error") {
			this.errorHandler = cb;
		}
		return this;
	}

	close() {
		this.closed = true;
	}

	trigger(url: string) {
		const req = { url };
		const res = new MockResponse();
		try {
			this.handler(req, res);
		} catch (error) {
			this.errorHandler?.(error as Error);
		}
		return res;
	}
}

const mockState = { server: null as MockServer | null };

const mockServerFs = {
	readFileSync: vi.fn(() => "<!DOCTYPE html><title>Success</title>"),
	existsSync: vi.fn(() => true),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
};

vi.mock("node:fs", () => ({
	default: mockServerFs,
	...mockServerFs,
}));

vi.mock("node:http", async () => {
	const actual = await vi.importActual<typeof import("node:http")>("node:http");
	const mocked = {
		...actual,
		createServer: (handler: (req: { url?: string }, res: MockResponse) => void) => {
			const server = new MockServer(handler);
			mockState.server = server;
			return server as unknown as import("node:http").Server;
		},
	};
	return {
		...mocked,
		default: mocked,
	};
});

describe("OAuth Server", () => {
	beforeEach(() => {
		mockState.server = null;
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("serves success page and captures authorization code", async () => {
		const { startLocalOAuthServer } = await import("../lib/auth/server.js");
		const serverInfo = await startLocalOAuthServer({ state: "state-123" });
		const response = mockState.server?.trigger("/auth/callback?code=CODE-42&state=state-123");
		expect(response?.statusCode).toBe(200);
		expect(response?.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(response?.body).toContain("<title>Success</title>");

		const result = await serverInfo.waitForCode("state-123");
		expect(result).toEqual({ code: "CODE-42" });
		serverInfo.close();
		expect(mockState.server?.closed).toBe(true);
	});

	it("returns null when state mismatch prevents code capture", async () => {
		vi.useFakeTimers();
		const { startLocalOAuthServer } = await import("../lib/auth/server.js");
		const serverInfo = await startLocalOAuthServer({ state: "expected" });
		const response = mockState.server?.trigger("/auth/callback?code=ignored&state=wrong");
		expect(response?.statusCode).toBe(400);
		expect(response?.body).toContain("State mismatch");

		const waitPromise = serverInfo.waitForCode("expected");
		await vi.advanceTimersByTimeAsync(60000);
		const result = await waitPromise;
		expect(result).toBeNull();
		serverInfo.close();
	});
});
