/**
 * Two credentials arrive in the same header, so the order they are tried in is a
 * behaviour: a rate-limited key must be reported as such rather than falling
 * through to the OAuth path and coming back as "invalid".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_SCOPES } from "@/lib/api/scopes";
import type { AdminAuth, ApiAuthResult, OrganizationAuth, UserAuth } from "@/lib/auth/api-auth";

const resolveApiAuth = vi.hoisted(() => vi.fn<(request: Request) => Promise<ApiAuthResult>>());
const verifyMcpAccessToken = vi.hoisted(() => vi.fn());
const listUserOrganizations = vi.hoisted(() => vi.fn());
const selectUser = vi.hoisted(() =>
	vi.fn<() => Promise<Array<{ id: string; email: string; name: string; banned?: boolean | null }>>>(),
);
const selectClient = vi.hoisted(() => vi.fn<() => Promise<Array<{ disabled?: boolean | null }>>>());

vi.mock("@/lib/auth/api-auth", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/api-auth")>()),
	resolveApiAuth,
}));
vi.mock("@workspace/lib/auth/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("@workspace/lib/auth/server")>()),
	verifyMcpAccessToken,
}));
vi.mock("@/lib/auth/server", () => ({ auth: {} }));
vi.mock("@/lib/auth/helpers", () => ({ listUserOrganizations }));
// Both reads share a builder, so the mock tells them apart by table.
vi.mock("@workspace/lib/db/db", async () => {
	const { user } = await import("@workspace/lib/db/schema");
	return {
		db: {
			select: () => ({
				from: (table: unknown) => ({
					where: () => ({ limit: () => (table === user ? selectUser() : selectClient()) }),
				}),
			}),
		},
	};
});

const { resolveMcpAuth } = await import("../auth");
const { principalLabel, principalScopes } = await import("@/lib/auth/api-auth");

const adminKey: AdminAuth = { kind: "admin", scopes: null, organizationId: null };

const orgKey: OrganizationAuth = {
	kind: "organization",
	keyId: "key_1",
	name: "reporting bot",
	organizationId: "org_1",
	organizationName: "Acme",
	scopes: new Set(["analytics:read"]),
	brandIds: null,
	createdAt: null,
	lastUsedAt: null,
	expiresAt: null,
	rateLimit: { limit: 1000, window: "minute" },
	rateLimitRemaining: null,
};

const oauthSession: UserAuth = {
	kind: "user",
	userId: "user_1",
	email: "someone@example.com",
	name: "Someone",
	organizationIds: ["org_1", "org_2"],
	clientId: "client_1",
	expiresAt: null,
};

const TOKEN_CLAIMS = { sub: "user_1", client_id: "client_1", exp: 1_800_000_000, scope: "openid" };

function bearer(token: string): Request {
	return new Request("http://localhost/api/mcp", {
		method: "POST",
		headers: { Authorization: `Bearer ${token}` },
	});
}

const INVALID_KEY: ApiAuthResult = {
	failure: { status: 401, error: "Unauthorized", message: "Invalid API key", code: "unauthorized" },
};

afterEach(() => vi.resetAllMocks());

describe("principalScopes", () => {
	it("gives an organization key exactly what it was issued", () => {
		expect([...principalScopes(orgKey)]).toEqual(["analytics:read"]);
	});

	it("gives an admin key everything", () => {
		expect([...principalScopes(adminKey)].sort()).toEqual([...API_SCOPES].sort());
	});

	it("gives a signed-in person everything, since scopes narrow keys and not people", () => {
		expect([...principalScopes(oauthSession)].sort()).toEqual([...API_SCOPES].sort());
	});
});

describe("mcp scopes are not oauth scopes", () => {
	it("holds, which is what makes it safe to ignore a token's scope claim", async () => {
		// `principalScopes` gives an OAuth caller every scope, which is only sound
		// while none of these can be asked for over OAuth.
		vi.stubEnv("APP_URL", "http://localhost:3000");
		vi.stubEnv("BETTER_AUTH_SECRET", "scope-invariant-test");
		const { createAuth } = await import("@workspace/lib/auth/server");
		const auth = createAuth();
		auth.$context.catch(() => {});

		const provider = auth.options.plugins?.find((plugin) => plugin.id === "oauth-provider") as
			| { options: { scopes?: string[] } }
			| undefined;
		expect(provider, "the MCP plugin is what serves OAuth here").toBeDefined();

		const offered = new Set(provider?.options.scopes ?? []);
		expect(API_SCOPES.filter((scope) => offered.has(scope))).toEqual([]);
		vi.unstubAllEnvs();
	});
});

describe("principalLabel", () => {
	it("names the workspace a key belongs to rather than the key", () => {
		expect(principalLabel(orgKey)).toContain("Acme");
	});

	it("names a person by the address they signed in with", () => {
		expect(principalLabel(oauthSession)).toBe("someone@example.com");
	});
});

describe("resolveMcpAuth", () => {
	it("accepts an API key without looking for a token", async () => {
		resolveApiAuth.mockResolvedValue({ auth: orgKey });
		await expect(resolveMcpAuth(bearer("elmo_live"))).resolves.toEqual({ auth: orgKey });
		expect(verifyMcpAccessToken).not.toHaveBeenCalled();
	});

	it("reports a rate-limited key as rate-limited rather than trying it as a token", async () => {
		const rateLimited: ApiAuthResult = {
			failure: {
				status: 429,
				error: "Too Many Requests",
				message: "Rate limit exceeded for this API key",
				code: "rate_limited",
				retryAfterSeconds: 30,
			},
		};
		resolveApiAuth.mockResolvedValue(rateLimited);
		await expect(resolveMcpAuth(bearer("elmo_live"))).resolves.toEqual(rateLimited);
		expect(verifyMcpAccessToken).not.toHaveBeenCalled();
	});

	it("falls back to the OAuth token when the bearer is not a key", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue(TOKEN_CLAIMS);
		selectUser.mockResolvedValue([{ id: "user_1", email: "someone@example.com", name: "Someone" }]);
		selectClient.mockResolvedValue([{ disabled: false }]);
		listUserOrganizations.mockResolvedValue([{ id: "org_1" }, { id: "org_2" }]);

		await expect(resolveMcpAuth(bearer("oauth-token"))).resolves.toEqual({
			auth: { ...oauthSession, expiresAt: new Date(TOKEN_CLAIMS.exp * 1000) },
		});
	});

	it("re-reads membership on every call rather than trusting the token", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue(TOKEN_CLAIMS);
		selectUser.mockResolvedValue([{ id: "user_1", email: "someone@example.com", name: "Someone" }]);
		selectClient.mockResolvedValue([{ disabled: false }]);
		listUserOrganizations.mockResolvedValue([]);

		const resolved = await resolveMcpAuth(bearer("oauth-token"));
		expect(resolved).toMatchObject({ auth: { organizationIds: [] } });
	});

	it("refuses a token whose user is gone", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue({ ...TOKEN_CLAIMS, sub: "deleted" });
		selectUser.mockResolvedValue([]);
		selectClient.mockResolvedValue([{ disabled: false }]);

		await expect(resolveMcpAuth(bearer("oauth-token"))).resolves.toEqual(INVALID_KEY);
	});

	it("refuses a banned person, whose signature is still perfectly good", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue(TOKEN_CLAIMS);
		selectUser.mockResolvedValue([{ id: "user_1", email: "someone@example.com", name: "Someone", banned: true }]);
		selectClient.mockResolvedValue([{ disabled: false }]);

		await expect(resolveMcpAuth(bearer("oauth-token"))).resolves.toEqual(INVALID_KEY);
	});

	it("refuses a token whose client has been disabled", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue(TOKEN_CLAIMS);
		selectUser.mockResolvedValue([{ id: "user_1", email: "someone@example.com", name: "Someone" }]);
		selectClient.mockResolvedValue([{ disabled: true }]);

		await expect(resolveMcpAuth(bearer("oauth-token"))).resolves.toEqual(INVALID_KEY);
	});

	it("refuses a token whose client is gone", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue(TOKEN_CLAIMS);
		selectUser.mockResolvedValue([{ id: "user_1", email: "someone@example.com", name: "Someone" }]);
		selectClient.mockResolvedValue([]);

		await expect(resolveMcpAuth(bearer("oauth-token"))).resolves.toEqual(INVALID_KEY);
	});

	it("fails closed when verification throws", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockRejectedValue(new Error("key set unreachable"));

		await expect(resolveMcpAuth(bearer("oauth-token"))).resolves.toEqual(INVALID_KEY);
	});

	it("refuses a token that names no client, since nothing holds it", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue({ sub: "user_1", exp: TOKEN_CLAIMS.exp });
		await expect(resolveMcpAuth(bearer("oauth-token"))).resolves.toEqual(INVALID_KEY);
		expect(selectUser).not.toHaveBeenCalled();
	});

	it("answers a credential that is neither with the key resolver's own wording", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockRejectedValue(new Error("invalid access token"));
		await expect(resolveMcpAuth(bearer("nonsense"))).resolves.toEqual(INVALID_KEY);
	});
});
