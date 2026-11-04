import type { ApiAuth } from "@/lib/auth/api-auth";
import { resetDeploymentCache } from "@workspace/deployment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiHandler } from "../handler";

const resolveApiAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/api-auth", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/auth/api-auth")>()),
	resolveApiAuth,
}));

function organizationKey(limit: number, remaining: number | null): ApiAuth {
	return {
		kind: "organization",
		keyId: "key_1",
		name: null,
		organizationId: "org_1",
		organizationName: "Example Org",
		scopes: new Set(["read", "write"]),
		brandIds: null,
		createdAt: null,
		lastUsedAt: null,
		expiresAt: null,
		rateLimit: { limit, window: "minute" },
		rateLimitRemaining: remaining,
	};
}

function call(handle: () => Promise<object> = async () => ({ ok: true })) {
	const handler = createApiHandler({ handle });
	return handler({
		request: new Request("http://localhost/api/v1/test", { headers: { Authorization: "Bearer elmo_key" } }),
		params: {},
	});
}

describe("createApiHandler rate-limit headers for an organization key", () => {
	beforeEach(() => {
		vi.stubEnv("DEPLOYMENT_MODE", "local");
		resetDeploymentCache();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		resetDeploymentCache();
	});

	it("states the key's own quota and what is left of it", async () => {
		resolveApiAuth.mockResolvedValueOnce({ auth: organizationKey(500, 498) });
		const response = await call();

		expect(response.status).toBe(200);
		expect(response.headers.get("RateLimit-Policy")).toBe('"per-key";q=500;w=60');
		expect(response.headers.get("RateLimit")).toBe('"per-key";r=498');
		expect(response.headers.get("X-RateLimit-Limit")).toBe("500");
		expect(response.headers.get("X-RateLimit-Remaining")).toBe("498");
	});

	it("states the quota without a remainder when the count is unknown", async () => {
		resolveApiAuth.mockResolvedValueOnce({ auth: organizationKey(1000, null) });
		const response = await call();

		expect(response.headers.get("RateLimit-Policy")).toBe('"per-key";q=1000;w=60');
		expect(response.headers.has("RateLimit")).toBe(false);
	});

	it("sends them on an error answer too", async () => {
		resolveApiAuth.mockResolvedValueOnce({ auth: organizationKey(1000, 10) });
		const response = await call(async () => {
			throw new Error("boom");
		});

		expect(response.status).toBe(500);
		expect(response.headers.get("RateLimit")).toBe('"per-key";r=10');
	});
});
