/**
 * Smoke tests for the better-auth server config.
 *
 * Guards plugin registration: the external API (/api/v1) depends on the
 * apiKey plugin's endpoints existing on `auth.api`. If a refactor drops
 * the plugin (or a better-auth upgrade renames the endpoints), these fail
 * before anything reaches the API layer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("createAuth", () => {
	beforeEach(() => {
		vi.stubEnv("APP_URL", "http://localhost:3000");
		vi.stubEnv("BETTER_AUTH_SECRET", "unit-test-secret-unit-test-secret-0000");
		vi.stubEnv("DATABASE_URL", "postgres://placeholder:placeholder@localhost:9/placeholder");
	});

	it("exposes the apiKey plugin endpoints on auth.api", async () => {
		const { createAuth } = await import("./server");
		const auth = createAuth();

		expect(typeof auth.api.createApiKey).toBe("function");
		expect(typeof auth.api.verifyApiKey).toBe("function");
		expect(typeof auth.api.listApiKeys).toBe("function");
		expect(typeof auth.api.updateApiKey).toBe("function");
		expect(typeof auth.api.deleteApiKey).toBe("function");
	});
});
