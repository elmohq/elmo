/**
 * Resolving an MCP caller.
 *
 * Two credentials arrive at the same endpoint in the same header, so the order
 * they are tried in is a behaviour rather than an implementation detail: a key
 * that has spent its rate limit must be reported as rate-limited, not fall
 * through to the OAuth path and come back as "invalid".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { API_SCOPES } from "@/lib/api/scopes";
import type { AdminAuth, ApiAuthResult, OrganizationAuth, UserAuth } from "@/lib/auth/api-auth";

const resolveApiAuth = vi.hoisted(() => vi.fn<(request: Request) => Promise<ApiAuthResult>>());
const verifyMcpAccessToken = vi.hoisted(() => vi.fn());
const listUserOrganizations = vi.hoisted(() => vi.fn());
const selectUser = vi.hoisted(() => vi.fn<() => Promise<Array<{ id: string; email: string; name: string }>>>());

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
vi.mock("@workspace/lib/db/db", () => ({
	db: {
		select: () => ({ from: () => ({ where: () => ({ limit: () => selectUser() }) }) }),
	},
}));

const { principalLabel, principalScopes, resolveMcpAuth } = await import("../auth");

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

/** What a verified MCP access token carries: who it stands for, and who holds it. */
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
		listUserOrganizations.mockResolvedValue([{ id: "org_1" }, { id: "org_2" }]);

		await expect(resolveMcpAuth(bearer("oauth-token"))).resolves.toEqual({
			auth: { ...oauthSession, expiresAt: new Date(TOKEN_CLAIMS.exp * 1000) },
		});
	});

	it("re-reads membership on every call rather than trusting the token", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue(TOKEN_CLAIMS);
		selectUser.mockResolvedValue([{ id: "user_1", email: "someone@example.com", name: "Someone" }]);
		listUserOrganizations.mockResolvedValue([]);

		const resolved = await resolveMcpAuth(bearer("oauth-token"));
		expect(resolved).toMatchObject({ auth: { organizationIds: [] } });
	});

	it("refuses a token whose user is gone", async () => {
		resolveApiAuth.mockResolvedValue(INVALID_KEY);
		verifyMcpAccessToken.mockResolvedValue({ ...TOKEN_CLAIMS, sub: "deleted" });
		selectUser.mockResolvedValue([]);

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
