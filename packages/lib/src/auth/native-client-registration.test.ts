import { mcp } from "@better-auth/mcp";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getSchema } from "better-auth/db";
import { jwt } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { nativeClientRegistrationDefault } from "./native-client-registration";

const BASE_URL = "https://elmo.test";

const options = {
	secret: "native-client-registration-test-secret",
	baseURL: BASE_URL,
	basePath: "/api/auth",
	plugins: [
		jwt({ disableSettingJwtHeader: true }),
		nativeClientRegistrationDefault(),
		mcp({
			loginPage: "/auth/login",
			consentPage: "/auth/authorize",
			resource: `${BASE_URL}/api/mcp`,
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
		}),
	],
} satisfies BetterAuthOptions;

// The in-memory store only reads tables it was handed up front.
const auth = betterAuth({
	...options,
	database: memoryAdapter(Object.fromEntries(Object.keys(getSchema(options)).map((model) => [model, []]))),
});

async function register(metadata: Record<string, unknown>) {
	const response = await auth.handler(
		new Request(`${BASE_URL}/api/auth/oauth2/register`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				client_name: "cli",
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
				token_endpoint_auth_method: "none",
				...metadata,
			}),
		}),
	);
	return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("dynamic client registration", () => {
	it("registers a client that only listens on loopback, which cannot serve https", async () => {
		const { status, body } = await register({
			redirect_uris: ["http://127.0.0.1:19876/mcp/oauth/callback"],
		});

		expect(status).toBe(201);
		expect(body.application_type).toBe("native");
		expect(body.redirect_uris).toEqual(["http://127.0.0.1:19876/mcp/oauth/callback"]);
	});

	it.each(["http://localhost:1455/callback", "http://[::1]:1455/callback"])(
		"registers a client listening on %s",
		async (redirectUri) => {
			const { status } = await register({ redirect_uris: [redirectUri] });

			expect(status).toBe(201);
		},
	);

	it("still holds a client that asks to be treated as a web app to https", async () => {
		const { status, body } = await register({
			application_type: "web",
			redirect_uris: ["http://127.0.0.1:19876/mcp/oauth/callback"],
		});

		expect(status).toBe(400);
		expect(body.error).toBe("invalid_redirect_uri");
	});

	it("leaves a browser client as a web app", async () => {
		const { status, body } = await register({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });

		expect(status).toBe(201);
		expect(body.application_type).toBe("web");
	});

	it("rejects a host that merely starts with a loopback name", async () => {
		const { status, body } = await register({ redirect_uris: ["http://localhost.example.com/callback"] });

		expect(status).toBe(400);
		expect(body.error).toBe("invalid_redirect_uri");
	});

	it("rejects a client asking for a public redirect alongside its loopback one", async () => {
		const { status, body } = await register({
			redirect_uris: ["http://127.0.0.1:19876/mcp/oauth/callback", "https://example.com/callback"],
		});

		expect(status).toBe(400);
		expect(body.error).toBe("invalid_redirect_uri");
	});
});
