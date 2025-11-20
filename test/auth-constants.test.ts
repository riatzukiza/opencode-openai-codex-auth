import { describe, expect, it } from "vitest";
import { AUTHORIZE_URL, CLIENT_ID, REDIRECT_URI, SCOPE } from "../lib/auth/auth";

describe("Auth Constants", () => {
	it("have expected default values", () => {
		expect(AUTHORIZE_URL).toBe("https://auth.openai.com/oauth/authorize");
		expect(CLIENT_ID).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
		expect(REDIRECT_URI).toBe("http://localhost:1455/auth/callback");
		expect(SCOPE).toBe("openid profile email offline_access");
	});
});
