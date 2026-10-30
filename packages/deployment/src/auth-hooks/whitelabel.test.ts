import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authSync = vi.hoisted(() => ({
	syncMemberships: vi.fn(),
	updateUserFlags: vi.fn(),
	findAccountByProvider: vi.fn(),
}));

vi.mock("@workspace/lib/db/auth-sync", () => authSync);

const AUTH0_USER_ID = "auth0|abc123";

/**
 * Stands in for the Auth0 tenant at the HTTP layer so the real ManagementClient
 * runs end to end; the user endpoint replies with whatever `appMetadata` is.
 */
function stubAuth0Tenant(appMetadata: unknown) {
	const fetchMock = vi.fn(async (input: string | URL | Request) => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
		if (url.pathname === "/oauth/token") {
			return Response.json({ access_token: "mgmt-token", expires_in: 86400, token_type: "Bearer" });
		}
		if (url.pathname === `/api/v2/users/${encodeURIComponent(AUTH0_USER_ID)}`) {
			return Response.json({ user_id: AUTH0_USER_ID, email: "user@example.com", app_metadata: appMetadata });
		}
		return new Response("not found", { status: 404 });
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

async function loadWhitelabel() {
	// The management client is cached per module, so each test gets a fresh one.
	vi.resetModules();
	return import("./whitelabel");
}

beforeEach(() => {
	vi.stubEnv("AUTH0_MGMT_API_DOMAIN", "tenant.example.auth0.com");
	vi.stubEnv("AUTH0_CLIENT_ID", "client-id");
	vi.stubEnv("AUTH0_CLIENT_SECRET", "client-secret");
	authSync.syncMemberships.mockResolvedValue({ added: [], removed: [], invalid: [] });
	authSync.updateUserFlags.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("syncAuth0User", () => {
	it("applies org memberships and flags from the user's Auth0 app_metadata", async () => {
		const fetchMock = stubAuth0Tenant({
			elmo_orgs: [{ id: "org_1", name: "Acme" }],
			elmo_admin: true,
			elmo_report_generator_access: true,
		});
		const { syncAuth0User } = await loadWhitelabel();

		const flags = await syncAuth0User("user_1", AUTH0_USER_ID);

		expect(flags).toEqual({ role: "admin", hasReportGeneratorAccess: true });
		expect(authSync.syncMemberships).toHaveBeenCalledWith("user_1", ["org_1"]);
		expect(authSync.updateUserFlags).toHaveBeenCalledWith("user_1", flags);
		const tokenCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/oauth/token"));
		expect(String(tokenCall?.[0])).toBe("https://tenant.example.auth0.com/oauth/token");
	});

	it("revokes all access when app_metadata is missing", async () => {
		stubAuth0Tenant(undefined);
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { syncAuth0User } = await loadWhitelabel();

		const flags = await syncAuth0User("user_1", AUTH0_USER_ID);

		expect(flags).toEqual({ role: "user", hasReportGeneratorAccess: false });
		expect(authSync.syncMemberships).toHaveBeenCalledWith("user_1", []);
	});

	it("fails without touching memberships when Auth0 rejects the management credentials", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ error: "access_denied" }, { status: 401 })),
		);
		const { syncAuth0User } = await loadWhitelabel();

		await expect(syncAuth0User("user_1", AUTH0_USER_ID)).rejects.toThrow();
		expect(authSync.syncMemberships).not.toHaveBeenCalled();
		expect(authSync.updateUserFlags).not.toHaveBeenCalled();
	});
});
