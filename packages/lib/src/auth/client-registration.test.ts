import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { getSchema } from "better-auth/db";
import { jwt } from "better-auth/plugins";
import { describe, expect, it } from "vitest";
import { nativeClientRegistrationDefault } from "./native-client-registration";

const BASE_URL = "https://elmo.test";
const CLIENT_ID_URL = "https://client.example.com/oauth/client.json";

const metadataDocument = {
	client_id: CLIENT_ID_URL,
	client_name: "Example CLI",
	redirect_uris: ["http://127.0.0.1:1455/callback"],
	grant_types: ["authorization_code", "refresh_token"],
	response_types: ["code"],
	token_endpoint_auth_method: "none",
};

// Stands in for the network so the document under test is the only variable.
const fetchClientMetadataResource = async (input: RequestInfo | URL) =>
	String(input) === CLIENT_ID_URL ? Response.json(metadataDocument) : new Response("not found", { status: 404 });

const options = {
	secret: "native-client-registration-test-secret",
	baseURL: BASE_URL,
	basePath: "/api/auth",
	plugins: [
		jwt({ disableSettingJwtHeader: true }),
		nativeClientRegistrationDefault(),
		cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
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

	it("registers a client that offers a hosted callback alongside its loopback one", async () => {
		const { status, body } = await register({
			redirect_uris: ["http://127.0.0.1:54321/callback", "https://www.example.com/mcp/oauth/callback"],
		});

		expect(status).toBe(201);
		expect(body.application_type).toBe("native");
		expect(body.redirect_uris).toEqual([
			"http://127.0.0.1:54321/callback",
			"https://www.example.com/mcp/oauth/callback",
		]);
	});

	it("registers a client that bundles a deeplink its platform never made well-formed", async () => {
		const { status, body } = await register({
			redirect_uris: [
				"cursor://anysphere.cursor-mcp/oauth/callback",
				"https://www.cursor.com/agents/mcp/oauth/callback",
				"http://localhost:8787/callback",
			],
		});

		expect(status).toBe(201);
		expect(body.redirect_uris).toEqual([
			"https://www.cursor.com/agents/mcp/oauth/callback",
			"http://localhost:8787/callback",
		]);
	});

	it("leaves a client that declares its own type exactly as it asked", async () => {
		const { status, body } = await register({
			application_type: "native",
			redirect_uris: ["http://localhost:8787/callback", "cursor://anysphere.cursor-mcp/oauth/callback"],
		});

		expect(status).toBe(400);
		expect(body.error_description).toContain("private-use");
	});

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
});

describe("client ID metadata documents", () => {
	async function authorize(params: Record<string, string>) {
		const query = new URLSearchParams({
			response_type: "code",
			code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
			code_challenge_method: "S256",
			...params,
		});
		return auth.handler(new Request(`${BASE_URL}/api/auth/oauth2/authorize?${query}`, { redirect: "manual" }));
	}

	it("is advertised so a client knows to skip registration", async () => {
		const response = await auth.handler(new Request(`${BASE_URL}/api/auth/.well-known/oauth-authorization-server`));
		const metadata = (await response.json()) as Record<string, unknown>;

		expect(metadata.client_id_metadata_document_supported).toBe(true);
		// Deprecated but still the only route for clients that predate CIMD.
		expect(metadata.registration_endpoint).toBe(`${BASE_URL}/api/auth/oauth2/register`);
	});

	it("admits a client that hosts its own identity, with no registration call at all", async () => {
		const response = await authorize({
			client_id: CLIENT_ID_URL,
			redirect_uri: "http://127.0.0.1:1455/callback",
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toContain("/auth/login");
	});

	it("fails closed when the document cannot be fetched", async () => {
		const response = await authorize({
			client_id: "https://client.example.com/gone.json",
			redirect_uri: "http://127.0.0.1:1455/callback",
		});
		const body = (await response.json()) as Record<string, string>;

		expect(response.status).toBe(400);
		expect(body.error).toBe("invalid_client");
	});
});
