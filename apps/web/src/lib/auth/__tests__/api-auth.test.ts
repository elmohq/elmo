/**
 * External API (v1) authentication regression tests.
 *
 * These exercise `resolveApiAuthWithDeps` with fake dependencies so the
 * derived-authority logic (owner role + memberships -> access) is verified
 * without touching better-auth or the database. The real-deps binding
 * (`resolveApiAuth`) is intentionally not imported here — it pulls in the
 * live auth instance, which belongs in an integration/e2e layer instead.
 *
 * Structure:
 *   1. parseBearerToken edge cases
 *   2. Token-missing / malformed-header resolution failure
 *   3. verifyApiKey failure outcomes (rate limit, usage, expired, disabled, invalid, throw)
 *   4. Success path: admin vs. user authority derivation
 *   5. Deps call-order / argument assertions
 */
import { describe, expect, it, vi } from "vitest";
import { type ApiAuthDeps, parseBearerToken, resolveApiAuthWithDeps } from "@/lib/auth/api-auth";

// ============================================================================
// Helpers
// ============================================================================

function makeRequest(authorizationHeader?: string | null): Request {
	const headers: Record<string, string> = {};
	if (authorizationHeader !== undefined && authorizationHeader !== null) {
		headers.Authorization = authorizationHeader;
	}
	return new Request("http://localhost/api/v1/x", { headers });
}

const VALID_KEY = { id: "key_1", referenceId: "user_1" };

function makeDeps(overrides?: Partial<ApiAuthDeps>): ApiAuthDeps {
	return {
		verifyApiKey: vi.fn(async () => ({
			valid: true,
			error: null,
			key: VALID_KEY,
		})),
		getOwner: vi.fn(async () => ({ role: "user" })),
		listOrgIds: vi.fn(async () => []),
		...overrides,
	};
}

// ============================================================================
// 1. parseBearerToken
// ============================================================================

describe("parseBearerToken", () => {
	it("extracts the token from a well-formed Bearer header", () => {
		expect(parseBearerToken("Bearer abc123")).toBe("abc123");
	});

	it("returns null for a missing header", () => {
		expect(parseBearerToken(null)).toBeNull();
		expect(parseBearerToken(undefined)).toBeNull();
	});

	it("returns null for an empty header", () => {
		expect(parseBearerToken("")).toBeNull();
	});

	it("returns null for the bare scheme with no trailing space", () => {
		expect(parseBearerToken("Bearer")).toBeNull();
	});

	it("returns null for the scheme followed by only whitespace", () => {
		expect(parseBearerToken("Bearer ")).toBeNull();
		expect(parseBearerToken("Bearer    ")).toBeNull();
	});

	it("is case-sensitive on the scheme (lowercase 'bearer' rejected)", () => {
		expect(parseBearerToken("bearer x")).toBeNull();
	});

	it("rejects a non-Bearer scheme", () => {
		expect(parseBearerToken("Basic xyz")).toBeNull();
	});
});

// ============================================================================
// 2. Token-missing / malformed-header resolution failure
// ============================================================================

describe("resolveApiAuthWithDeps: missing or malformed Authorization header", () => {
	const expectedFailure = {
		ok: false,
		status: 401,
		error: "Unauthorized",
		message: "Valid API key required as Bearer token in Authorization header",
	};

	it("fails when there is no Authorization header", async () => {
		const deps = makeDeps();
		const result = await resolveApiAuthWithDeps(makeRequest(), deps);
		expect(result).toEqual(expectedFailure);
	});

	it("fails on a non-Bearer scheme", async () => {
		const deps = makeDeps();
		const result = await resolveApiAuthWithDeps(makeRequest("Basic xyz"), deps);
		expect(result).toEqual(expectedFailure);
	});

	it("fails on an empty Bearer token", async () => {
		const deps = makeDeps();
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer "), deps);
		expect(result).toEqual(expectedFailure);
	});

	it("fails on a whitespace-only Bearer token", async () => {
		const deps = makeDeps();
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer    "), deps);
		expect(result).toEqual(expectedFailure);
	});

	it("does not call verifyApiKey, getOwner, or listOrgIds when the header is malformed", async () => {
		const deps = makeDeps();
		await resolveApiAuthWithDeps(makeRequest("Basic xyz"), deps);
		expect(deps.verifyApiKey).not.toHaveBeenCalled();
		expect(deps.getOwner).not.toHaveBeenCalled();
		expect(deps.listOrgIds).not.toHaveBeenCalled();
	});
});

// ============================================================================
// 3. verifyApiKey failure outcomes
// ============================================================================

describe("resolveApiAuthWithDeps: verifyApiKey failure outcomes", () => {
	it("maps RATE_LIMIT_EXCEEDED to 429 Rate Limit Exceeded", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "RATE_LIMIT_EXCEEDED", message: "too many requests" },
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 429,
			error: "Rate Limit Exceeded",
			message: "API key rate limit exceeded. Try again later.",
		});
	});

	it("maps USAGE_EXCEEDED to 429 Rate Limit Exceeded", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "USAGE_EXCEEDED", message: "usage exceeded" },
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 429,
			error: "Rate Limit Exceeded",
			message: "API key usage limit exceeded.",
		});
	});

	it("maps KEY_EXPIRED to 401 Unauthorized", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "KEY_EXPIRED", message: "expired" },
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "API key has expired.",
		});
	});

	it("maps KEY_DISABLED to 401 Unauthorized", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "KEY_DISABLED", message: "disabled" },
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "API key is disabled.",
		});
	});

	it("maps KEY_NOT_FOUND (unknown code) to 401 Invalid API key", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "KEY_NOT_FOUND", message: "not found" },
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "Invalid API key",
		});
	});

	it("maps INVALID_API_KEY to 401 Invalid API key", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "INVALID_API_KEY", message: "invalid" },
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "Invalid API key",
		});
	});

	it("maps USER_BANNED to 401 Invalid API key", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "USER_BANNED", message: "banned" },
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "Invalid API key",
		});
	});

	it("maps a failure with an absent/null error code to 401 Invalid API key", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: null, message: "something went wrong" },
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "Invalid API key",
		});
	});

	it("maps valid:true with a null key to 401 Invalid API key", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: null,
			})),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "Invalid API key",
		});
	});

	it("fails closed (401 Invalid API key) and logs when verifyApiKey throws", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const thrown = new Error("network blip");
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => {
				throw thrown;
			}),
		});

		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);

		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "Invalid API key",
		});
		expect(consoleErrorSpy).toHaveBeenCalledWith(thrown);

		consoleErrorSpy.mockRestore();
	});

	it("does not call getOwner or listOrgIds when verification fails", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "KEY_EXPIRED", message: "expired" },
				key: null,
			})),
		});
		await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(deps.getOwner).not.toHaveBeenCalled();
		expect(deps.listOrgIds).not.toHaveBeenCalled();
	});
});

// ============================================================================
// 4. Success path: admin vs. user authority derivation
// ============================================================================

describe("resolveApiAuthWithDeps: success path authority derivation", () => {
	it("fails closed when the key owner's user row is missing (deleted user)", async () => {
		const deps = makeDeps({ getOwner: vi.fn(async () => null) });
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: false,
			status: 401,
			error: "Unauthorized",
			message: "Invalid API key",
		});
	});

	it("does not call listOrgIds when the owner's user row is missing", async () => {
		const deps = makeDeps({ getOwner: vi.fn(async () => null) });
		await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(deps.listOrgIds).not.toHaveBeenCalled();
	});

	it("grants instance-wide admin access when the owner's role is admin", async () => {
		const deps = makeDeps({ getOwner: vi.fn(async () => ({ role: "admin" })) });
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "admin", userId: "user_1", keyId: "key_1" },
		});
	});

	it("does not call listOrgIds for an admin owner", async () => {
		const deps = makeDeps({ getOwner: vi.fn(async () => ({ role: "admin" })) });
		await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(deps.listOrgIds).not.toHaveBeenCalled();
	});

	it("scopes access to member orgs when the owner's role is a non-admin string", async () => {
		const deps = makeDeps({
			getOwner: vi.fn(async () => ({ role: "user" })),
			listOrgIds: vi.fn(async () => ["brand_a", "brand_b"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: ["brand_a", "brand_b"] },
		});
	});

	it("treats an existing owner with a null role as a scoped user, not an orphaned key", async () => {
		// user.role is nullable — whitelabel SSO sync creates users without a
		// global role. Only a *missing* user row invalidates the key.
		const deps = makeDeps({
			getOwner: vi.fn(async () => ({ role: null })),
			listOrgIds: vi.fn(async () => ["brand_a"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: ["brand_a"] },
		});
	});

	it("scopes access to member orgs when the owner's role is an empty string", async () => {
		const deps = makeDeps({
			getOwner: vi.fn(async () => ({ role: "" })),
			listOrgIds: vi.fn(async () => ["brand_a"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: ["brand_a"] },
		});
	});

	it("allows an empty brandIds array for a user owner with no memberships", async () => {
		const deps = makeDeps({
			getOwner: vi.fn(async () => ({ role: "user" })),
			listOrgIds: vi.fn(async () => []),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: [] },
		});
	});

	it("preserves the order of multiple org ids in brandIds", async () => {
		const orgIds = ["brand_z", "brand_a", "brand_m"];
		const deps = makeDeps({
			getOwner: vi.fn(async () => ({ role: "user" })),
			listOrgIds: vi.fn(async () => orgIds),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result.ok).toBe(true);
		if (result.ok && result.auth.type === "user") {
			expect(result.auth.brandIds).toEqual(["brand_z", "brand_a", "brand_m"]);
		}
	});
});

// ============================================================================
// 5. Deps call-order / argument assertions
// ============================================================================

describe("resolveApiAuthWithDeps: dependency call arguments", () => {
	it("passes the raw bearer token (not the full header) to verifyApiKey", async () => {
		const deps = makeDeps();
		await resolveApiAuthWithDeps(makeRequest("Bearer my-raw-token"), deps);
		expect(deps.verifyApiKey).toHaveBeenCalledWith("my-raw-token");
		expect(deps.verifyApiKey).toHaveBeenCalledTimes(1);
	});

	it("calls getOwner with the key owner's referenceId", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { id: "key_9", referenceId: "user_42" },
			})),
		});
		await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(deps.getOwner).toHaveBeenCalledWith("user_42");
		expect(deps.getOwner).toHaveBeenCalledTimes(1);
	});

	it("calls listOrgIds with the key owner's referenceId for non-admin owners", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { id: "key_9", referenceId: "user_42" },
			})),
			getOwner: vi.fn(async () => ({ role: "user" })),
		});
		await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(deps.listOrgIds).toHaveBeenCalledWith("user_42");
		expect(deps.listOrgIds).toHaveBeenCalledTimes(1);
	});
});
