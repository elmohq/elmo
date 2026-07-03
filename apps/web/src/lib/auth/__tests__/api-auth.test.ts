/**
 * External API (v1) authentication regression tests.
 *
 * These exercise `resolveApiAuthWithDeps` with fake dependencies so the
 * auth logic (env admin keys, membership-derived scope, per-key brand
 * restrictions) is verified without touching better-auth or the database.
 * The real-deps binding (`resolveApiAuth`) is intentionally not imported
 * here — it pulls in the live auth instance, which belongs in an
 * integration/e2e layer instead.
 *
 * Structure:
 *   1. parseBearerToken edge cases
 *   2. Token-missing / malformed-header resolution failure
 *   3. Instance-admin env keys (ADMIN_API_KEYS)
 *   4. verifyApiKey failure outcomes (rate limit, usage, expired, disabled, invalid, throw)
 *   5. User keys: membership-derived scope + per-key brand restriction
 *   6. parseBrandRestriction edge cases
 *   7. Deps call-order / argument assertions
 */
import { describe, expect, it, vi } from "vitest";
import {
	type ApiAuthDeps,
	parseBearerToken,
	parseBrandRestriction,
	parseReadOnly,
	resolveApiAuthWithDeps,
} from "@/lib/auth/api-auth";

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
		adminApiKeys: [],
		verifyApiKey: vi.fn(async () => ({
			valid: true,
			error: null,
			key: VALID_KEY,
		})),
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

	it("does not call verifyApiKey or listOrgIds when the header is malformed", async () => {
		const deps = makeDeps({ adminApiKeys: ["admin-key"] });
		await resolveApiAuthWithDeps(makeRequest("Basic xyz"), deps);
		expect(deps.verifyApiKey).not.toHaveBeenCalled();
		expect(deps.listOrgIds).not.toHaveBeenCalled();
	});
});

// ============================================================================
// 3. Instance-admin env keys (ADMIN_API_KEYS)
// ============================================================================

describe("resolveApiAuthWithDeps: instance-admin env keys", () => {
	it("grants the admin context on an exact env-key match", async () => {
		const deps = makeDeps({ adminApiKeys: ["admin-key-1", "admin-key-2"] });
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer admin-key-2"), deps);
		expect(result).toEqual({ ok: true, auth: { type: "admin" } });
	});

	it("does not call verifyApiKey on an env-key match (no rate-limit charge)", async () => {
		const deps = makeDeps({ adminApiKeys: ["admin-key"] });
		await resolveApiAuthWithDeps(makeRequest("Bearer admin-key"), deps);
		expect(deps.verifyApiKey).not.toHaveBeenCalled();
		expect(deps.listOrgIds).not.toHaveBeenCalled();
	});

	it("falls through to dashboard-key verification when the token matches no env key", async () => {
		const deps = makeDeps({ adminApiKeys: ["admin-key"] });
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer other-token"), deps);
		expect(deps.verifyApiKey).toHaveBeenCalledWith("other-token");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.auth.type).toBe("user");
		}
	});

	it("never treats a token as an env key when the list is empty", async () => {
		const deps = makeDeps({ adminApiKeys: [] });
		await resolveApiAuthWithDeps(makeRequest("Bearer anything"), deps);
		expect(deps.verifyApiKey).toHaveBeenCalledWith("anything");
	});

	it("does not match on an env-key prefix (exact comparison only)", async () => {
		const deps = makeDeps({ adminApiKeys: ["admin-key"] });
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer admin-key-longer"), deps);
		expect(deps.verifyApiKey).toHaveBeenCalledWith("admin-key-longer");
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.auth.type).toBe("user");
		}
	});
});

// ============================================================================
// 4. verifyApiKey failure outcomes
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

	it("does not call listOrgIds when verification fails", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: false,
				error: { code: "KEY_EXPIRED", message: "expired" },
				key: null,
			})),
		});
		await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(deps.listOrgIds).not.toHaveBeenCalled();
	});
});

// ============================================================================
// 5. User keys: membership-derived scope + per-key brand restriction
// ============================================================================

describe("resolveApiAuthWithDeps: user key scope derivation", () => {
	it("scopes an unrestricted key to the owner's member orgs", async () => {
		const deps = makeDeps({
			listOrgIds: vi.fn(async () => ["brand_a", "brand_b"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: ["brand_a", "brand_b"], readOnly: false },
		});
	});

	it("yields an empty scope for an owner with no memberships (incl. deleted owners)", async () => {
		// A deleted owner's `member` rows cascade away, so an orphaned key
		// degrades to an empty scope — every brand-scoped request 404s.
		const deps = makeDeps({ listOrgIds: vi.fn(async () => []) });
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: [], readOnly: false },
		});
	});

	it("preserves membership order in brandIds", async () => {
		const deps = makeDeps({
			listOrgIds: vi.fn(async () => ["brand_z", "brand_a", "brand_m"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result.ok).toBe(true);
		if (result.ok && result.auth.type === "user") {
			expect(result.auth.brandIds).toEqual(["brand_z", "brand_a", "brand_m"]);
		}
	});

	it("intersects the owner scope with a metadata brand restriction", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { ...VALID_KEY, metadata: { brandIds: ["brand_b", "brand_c"] } },
			})),
			listOrgIds: vi.fn(async () => ["brand_a", "brand_b"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: ["brand_b"], readOnly: false },
		});
	});

	it("never widens scope: a restriction naming a non-member brand grants nothing", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { ...VALID_KEY, metadata: { brandIds: ["brand_foreign"] } },
			})),
			listOrgIds: vi.fn(async () => ["brand_a"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: [], readOnly: false },
		});
	});

	it("treats an explicit empty restriction as scope-to-nothing (fail closed)", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { ...VALID_KEY, metadata: { brandIds: [] } },
			})),
			listOrgIds: vi.fn(async () => ["brand_a"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result.ok).toBe(true);
		if (result.ok && result.auth.type === "user") {
			expect(result.auth.brandIds).toEqual([]);
		}
	});

	it("ignores malformed metadata (no restriction, full member scope)", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { ...VALID_KEY, metadata: { brandIds: "not-an-array" } },
			})),
			listOrgIds: vi.fn(async () => ["brand_a"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result.ok).toBe(true);
		if (result.ok && result.auth.type === "user") {
			expect(result.auth.brandIds).toEqual(["brand_a"]);
		}
	});

	it("marks the context read-only when metadata.readOnly is true", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { ...VALID_KEY, metadata: { readOnly: true } },
			})),
			listOrgIds: vi.fn(async () => ["brand_a"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: ["brand_a"], readOnly: true },
		});
	});

	it("defaults readOnly to false when the flag is absent", async () => {
		const deps = makeDeps({ listOrgIds: vi.fn(async () => ["brand_a"]) });
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result.ok).toBe(true);
		if (result.ok && result.auth.type === "user") {
			expect(result.auth.readOnly).toBe(false);
		}
	});

	it("combines a brand restriction and the read-only flag on one key", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { ...VALID_KEY, metadata: { brandIds: ["brand_a"], readOnly: true } },
			})),
			listOrgIds: vi.fn(async () => ["brand_a", "brand_b"]),
		});
		const result = await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(result).toEqual({
			ok: true,
			auth: { type: "user", userId: "user_1", keyId: "key_1", brandIds: ["brand_a"], readOnly: true },
		});
	});
});

// ============================================================================
// 6. parseBrandRestriction / parseReadOnly
// ============================================================================

describe("parseBrandRestriction", () => {
	it("returns the string entries of a well-formed brandIds array", () => {
		expect(parseBrandRestriction({ brandIds: ["a", "b"] })).toEqual(["a", "b"]);
	});

	it("returns null for absent metadata", () => {
		expect(parseBrandRestriction(undefined)).toBeNull();
		expect(parseBrandRestriction(null)).toBeNull();
	});

	it("returns null for non-object metadata", () => {
		expect(parseBrandRestriction("string")).toBeNull();
		expect(parseBrandRestriction(42)).toBeNull();
		expect(parseBrandRestriction(["a"])).toBeNull();
	});

	it("returns null when brandIds is missing or not an array", () => {
		expect(parseBrandRestriction({})).toBeNull();
		expect(parseBrandRestriction({ brandIds: "a" })).toBeNull();
		expect(parseBrandRestriction({ brandIds: { 0: "a" } })).toBeNull();
	});

	it("keeps an explicit empty array (restricts to nothing)", () => {
		expect(parseBrandRestriction({ brandIds: [] })).toEqual([]);
	});

	it("drops non-string entries (restricts to the valid ones only)", () => {
		expect(parseBrandRestriction({ brandIds: ["a", 42, null, "b"] })).toEqual(["a", "b"]);
	});
});

describe("parseReadOnly", () => {
	it("returns true only for an explicit readOnly === true", () => {
		expect(parseReadOnly({ readOnly: true })).toBe(true);
	});

	it("returns false for absent, non-object, or non-true readOnly", () => {
		expect(parseReadOnly(undefined)).toBe(false);
		expect(parseReadOnly(null)).toBe(false);
		expect(parseReadOnly("readOnly")).toBe(false);
		expect(parseReadOnly(["readOnly"])).toBe(false);
		expect(parseReadOnly({})).toBe(false);
		expect(parseReadOnly({ readOnly: false })).toBe(false);
		expect(parseReadOnly({ readOnly: "true" })).toBe(false);
		expect(parseReadOnly({ readOnly: 1 })).toBe(false);
	});
});

// ============================================================================
// 7. Deps call-order / argument assertions
// ============================================================================

describe("resolveApiAuthWithDeps: deps calls", () => {
	it("calls verifyApiKey with the raw token", async () => {
		const deps = makeDeps();
		await resolveApiAuthWithDeps(makeRequest("Bearer my-secret-token"), deps);
		expect(deps.verifyApiKey).toHaveBeenCalledWith("my-secret-token");
		expect(deps.verifyApiKey).toHaveBeenCalledTimes(1);
	});

	it("calls listOrgIds with the key owner's referenceId", async () => {
		const deps = makeDeps({
			verifyApiKey: vi.fn(async () => ({
				valid: true,
				error: null,
				key: { id: "key_9", referenceId: "user_42" },
			})),
		});
		await resolveApiAuthWithDeps(makeRequest("Bearer tok"), deps);
		expect(deps.listOrgIds).toHaveBeenCalledWith("user_42");
		expect(deps.listOrgIds).toHaveBeenCalledTimes(1);
	});
});
