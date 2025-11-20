import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logError } from "../logger.js";
import type { OAuthServerInfo } from "../types.js";

// Resolve path to oauth-success.html (one level up from auth/ subfolder)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const successHtml = fs.readFileSync(path.join(__dirname, "..", "oauth-success.html"), "utf-8");

/**
 * Start a small local HTTP server that waits for /auth/callback and returns the code
 * @param options - OAuth state for validation
 * @returns Promise that resolves to server info
 */
export function startLocalOAuthServer({ state }: { state: string }): Promise<OAuthServerInfo> {
	const server = http.createServer((req, res) => {
		const send = (status: number, message: string, headers?: Record<string, string>) => {
			if (headers) {
				res.writeHead(status, headers);
			} else {
				res.writeHead(status);
			}
			res.end(message);
		};

		try {
			const url = new URL(req.url || "", "http://localhost");
			if (url.pathname !== "/auth/callback") {
				send(404, "Not found");
				return;
			}
			if (url.searchParams.get("state") !== state) {
				send(400, "State mismatch");
				return;
			}
			const code = url.searchParams.get("code");
			if (!code) {
				send(400, "Missing authorization code");
				return;
			}
			send(200, successHtml, { "Content-Type": "text/html; charset=utf-8" });
			(server as http.Server & { _lastCode?: string })._lastCode = code;
		} catch {
			send(500, "Internal error");
		}
	});

	return new Promise((resolve) => {
		server
			.listen(1455, "127.0.0.1", () => {
				resolve({
					port: 1455,
					close: () => server.close(),
					waitForCode: async () => {
						const poll = () => new Promise<void>((r) => setTimeout(r, 100));
						for (let i = 0; i < 600; i++) {
							const lastCode = (server as http.Server & { _lastCode?: string })._lastCode;
							if (lastCode) return { code: lastCode };
							await poll();
						}
						return null;
					},
				});
			})
			.on("error", (err: NodeJS.ErrnoException) => {
				logError("Failed to bind OAuth callback server", { code: err?.code });
				resolve({
					port: 1455,
					close: () => {
						try {
							server.close();
						} catch {}
					},
					waitForCode: async () => null,
				});
			});
	});
}
