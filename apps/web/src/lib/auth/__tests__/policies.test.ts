/**
 * Access-control policy regression tests.
 *
 * This file is the single source of truth for "who can do what" across all
 * deployment modes. If a policy changes, a test here MUST break — that's
 * the whole point.
 *
 * Structure:
 *   1. Deployment request policy matrix  (deploymentMiddleware)
 *   2. Auth function-level policies       (requireAuth / requireAdmin / requireOrgAccess)
 *   3. Route guard policies               (_authed / admin / $brand beforeLoad)
 *   4. API key authentication
 *   5. Read-only enforcement
 */
import { describe, it, expect } from "vitest";
import {
	evaluateDeploymentPolicy,
	evaluateApiKeyAuth,
	evaluateRequireAdmin,
	evaluateRequireOrgAccess,
	evaluateReadOnly,
	evaluateAuthedRouteGuard,
	evaluateAdminRouteGuard,
	evaluateBrandRouteGuard,
	type RequestInfo,
} from "@/lib/auth/policies";
import {
	LOCAL_FEATURES,
	DEMO_FEATURES,
	WHITELABEL_FEATURES,
	createMockSession,
} from "@/test/mocks/auth";

// ============================================================================
// Helpers
// ============================================================================

function req(
	method: string,
	pathname: string,
	authorizationHeader?: string,
): RequestInfo {
	return { pathname, method, authorizationHeader };
}

const VALID_API_KEY = "test-key-abc123";
const INVALID_API_KEY = "wrong-key";
const API_KEYS = [VALID_API_KEY, "another-key"];

// ============================================================================
// 1. Deployment Request Policy Matrix
// ============================================================================

describe("evaluateDeploymentPolicy", () => {
	// ────────────────────────────────────────────────────────────
	// Local mode: readOnly=false
	// ────────────────────────────────────────────────────────────
	describe("local mode", () => {
		const features = LOCAL_FEATURES;

		it("allows GET to app routes", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/app/brand-1"));
			expect(result.action).toBe("allow");
		});

		it("allows POST to API routes (not read-only)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/brands"));
			expect(result.action).toBe("allow");
		});

		it("allows GET to admin routes (full access)", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/admin"));
			expect(result.action).toBe("allow");
		});

		it("allows POST to admin routes (full access)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/admin"));
			expect(result.action).toBe("allow");
		});

		it("allows DELETE to admin routes (full access)", () => {
			const result = evaluateDeploymentPolicy(features, req("DELETE", "/admin/tools"));
			expect(result.action).toBe("allow");
		});

		it("blocks API v1 without key", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/prompts"),
				{ adminApiKeys: API_KEYS },
			);
			expect(result).toMatchObject({ action: "block", status: 401 });
		});

		it("allows API v1 with valid key", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/prompts", `Bearer ${VALID_API_KEY}`),
				{ adminApiKeys: API_KEYS },
			);
			expect(result.action).toBe("allow");
		});

		it("blocks API v1 with invalid key", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/prompts", `Bearer ${INVALID_API_KEY}`),
				{ adminApiKeys: API_KEYS },
			);
			expect(result).toMatchObject({ action: "block", status: 401 });
		});

		it("allows API v1 docs without key", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/docs"),
				{ adminApiKeys: API_KEYS },
			);
			expect(result.action).toBe("allow");
		});

		it("serves OpenAPI spec", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/openapi.json"),
			);
			expect(result.action).toBe("serve-openapi");
		});
	});

	// ────────────────────────────────────────────────────────────
	// Demo mode: readOnly=true
	// ────────────────────────────────────────────────────────────
	describe("demo mode", () => {
		const features = DEMO_FEATURES;

		it("allows GET to app routes", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/app/brand-1"));
			expect(result.action).toBe("allow");
		});

		it("blocks POST to API routes (read-only)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/brands"));
			expect(result).toMatchObject({
				action: "block",
				status: 403,
				error: "Demo Mode",
			});
		});

		it("blocks PUT to API routes (read-only)", () => {
			const result = evaluateDeploymentPolicy(features, req("PUT", "/api/brands/123"));
			expect(result).toMatchObject({ action: "block", status: 403 });
		});

		it("blocks DELETE to API routes (read-only)", () => {
			const result = evaluateDeploymentPolicy(features, req("DELETE", "/api/brands/123"));
			expect(result).toMatchObject({ action: "block", status: 403 });
		});

		it("allows GET to API routes", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/brands"));
			expect(result.action).toBe("allow");
		});

		it("exempts plausible events from read-only", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("POST", "/api/plausible/event"),
			);
			expect(result.action).toBe("allow");
		});

		it("exempts plausible events with trailing slash", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("POST", "/api/plausible/event/"),
			);
			expect(result.action).toBe("allow");
		});

		it("exempts better-auth sign-in from read-only (so visitors can log in)", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("POST", "/api/auth/sign-in/email"),
			);
			expect(result.action).toBe("allow");
		});

		it("exempts better-auth sign-out from read-only", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("POST", "/api/auth/sign-out"),
			);
			expect(result.action).toBe("allow");
		});

		it("blocks POST to /api/v1 before reaching key check (read-only takes priority)", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("POST", "/api/v1/prompts", `Bearer ${VALID_API_KEY}`),
				{ adminApiKeys: API_KEYS },
			);
			expect(result).toMatchObject({
				action: "block",
				status: 403,
				error: "Demo Mode",
			});
		});

		it("allows GET to /api/v1 with valid key", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/prompts", `Bearer ${VALID_API_KEY}`),
				{ adminApiKeys: API_KEYS },
			);
			expect(result.action).toBe("allow");
		});

		it("serves OpenAPI spec in demo mode", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/openapi.json"),
			);
			expect(result.action).toBe("serve-openapi");
		});
	});

	// ────────────────────────────────────────────────────────────
	// Whitelabel mode: readOnly=false
	// ────────────────────────────────────────────────────────────
	describe("whitelabel mode", () => {
		const features = WHITELABEL_FEATURES;

		it("allows GET to app routes", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/app/brand-1"));
			expect(result.action).toBe("allow");
		});

		it("allows POST to API routes (not read-only)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/brands"));
			expect(result.action).toBe("allow");
		});

		it("allows GET to admin routes (full access)", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/admin"));
			expect(result.action).toBe("allow");
		});

		it("allows POST to admin routes (full access)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/admin"));
			expect(result.action).toBe("allow");
		});

		it("blocks API v1 without key", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/prompts"),
				{ adminApiKeys: API_KEYS },
			);
			expect(result).toMatchObject({ action: "block", status: 401 });
		});

		it("allows API v1 with valid key", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("GET", "/api/v1/prompts", `Bearer ${VALID_API_KEY}`),
				{ adminApiKeys: API_KEYS },
			);
			expect(result.action).toBe("allow");
		});
	});

	// ────────────────────────────────────────────────────────────
	// Custom / edge-case feature combos
	// ────────────────────────────────────────────────────────────
	describe("custom feature combinations", () => {
		it("blocks API v1 when no keys are configured", () => {
			const result = evaluateDeploymentPolicy(
				LOCAL_FEATURES,
				req("GET", "/api/v1/prompts", `Bearer ${VALID_API_KEY}`),
				{ adminApiKeys: [] },
			);
			expect(result).toMatchObject({ action: "block", status: 401 });
		});

		it("handles /api/v1/openapi.json with trailing slash", () => {
			const result = evaluateDeploymentPolicy(
				LOCAL_FEATURES,
				req("GET", "/api/v1/openapi.json/"),
			);
			expect(result.action).toBe("serve-openapi");
		});

		it("allows /api/v1/docs with trailing slash", () => {
			const result = evaluateDeploymentPolicy(
				LOCAL_FEATURES,
				req("GET", "/api/v1/docs/"),
				{ adminApiKeys: API_KEYS },
			);
			expect(result.action).toBe("allow");
		});

		it("blocks TanStack server-function POST routes in read-only mode", () => {
			const result = evaluateDeploymentPolicy(
				DEMO_FEATURES,
				req("POST", "/_server"),
			);
			expect(result).toMatchObject({
				action: "block",
				status: 403,
				error: "Demo Mode",
			});
		});
	});
});

// ============================================================================
// 2. Auth Function-Level Policies
// ============================================================================

describe("evaluateRequireAdmin", () => {
	it("denies non-admin users", () => {
		expect(evaluateRequireAdmin(false)).toBe("deny");
	});

	it("allows admin users", () => {
		expect(evaluateRequireAdmin(true)).toBe("allow");
	});
});

describe("evaluateRequireOrgAccess", () => {
	it("denies when user has no org access", () => {
		expect(evaluateRequireOrgAccess(false)).toBe("deny");
	});

	it("allows when user has org access", () => {
		expect(evaluateRequireOrgAccess(true)).toBe("allow");
	});
});

describe("evaluateReadOnly", () => {
	it("denies writes when read-only is enabled", () => {
		expect(evaluateReadOnly(true)).toBe("deny");
	});

	it("allows writes when read-only is disabled", () => {
		expect(evaluateReadOnly(false)).toBe("allow");
	});
});

// ============================================================================
// 3. Route Guard Policies
// ============================================================================

describe("evaluateAuthedRouteGuard", () => {
	const session = createMockSession();

	it("redirects to login when no session", () => {
		expect(evaluateAuthedRouteGuard(null)).toBe("redirect-to-login");
	});

	it("allows when session exists", () => {
		expect(evaluateAuthedRouteGuard(session)).toBe("allow");
	});
});

describe("evaluateAdminRouteGuard", () => {
	it("returns not-found when user is not admin", () => {
		expect(evaluateAdminRouteGuard(false)).toBe("not-found");
	});

	it("allows admin users", () => {
		expect(evaluateAdminRouteGuard(true)).toBe("allow");
	});
});

describe("evaluateBrandRouteGuard", () => {
	it("returns not-found when user has no org access", () => {
		expect(evaluateBrandRouteGuard(false)).toBe("not-found");
	});

	it("allows when user has org access", () => {
		expect(evaluateBrandRouteGuard(true)).toBe("allow");
	});
});

// ============================================================================
// 4. API Key Authentication
// ============================================================================

describe("evaluateApiKeyAuth", () => {
	const keys = ["key-1", "key-2", "key-3"];

	it("rejects missing Authorization header", () => {
		const result = evaluateApiKeyAuth(null, keys);
		expect(result).not.toBe("allow");
	});

	it("rejects empty Authorization header", () => {
		const result = evaluateApiKeyAuth("", keys);
		expect(result).not.toBe("allow");
	});

	it("rejects non-Bearer scheme", () => {
		const result = evaluateApiKeyAuth("Basic abc123", keys);
		expect(result).not.toBe("allow");
	});

	it("rejects invalid key", () => {
		const result = evaluateApiKeyAuth("Bearer wrong-key", keys);
		expect(result).not.toBe("allow");
		if (result !== "allow") {
			expect(result.message).toContain("Invalid API key");
		}
	});

	it("rejects when no keys are configured", () => {
		const result = evaluateApiKeyAuth("Bearer key-1", []);
		expect(result).not.toBe("allow");
	});

	it("allows valid key", () => {
		expect(evaluateApiKeyAuth("Bearer key-1", keys)).toBe("allow");
	});

	it("allows any of the configured keys", () => {
		expect(evaluateApiKeyAuth("Bearer key-2", keys)).toBe("allow");
		expect(evaluateApiKeyAuth("Bearer key-3", keys)).toBe("allow");
	});
});

// ============================================================================
// 5. Cross-cutting: Full scenario tests
//    These simulate a user journey through multiple policy layers.
// ============================================================================

describe("full access-control scenarios", () => {
	describe("local developer", () => {
		const features = LOCAL_FEATURES;
		const session = createMockSession();

		it("can access everything after auth", () => {
			// Deployment policy: allows all
			expect(evaluateDeploymentPolicy(features, req("GET", "/app/org-1")).action).toBe("allow");
			expect(evaluateDeploymentPolicy(features, req("GET", "/admin")).action).toBe("allow");
			expect(evaluateDeploymentPolicy(features, req("POST", "/admin")).action).toBe("allow");

			// Route guards: allow with session
			expect(evaluateAuthedRouteGuard(session)).toBe("allow");
		});
	});

	describe("demo visitor", () => {
		const features = DEMO_FEATURES;
		const session = createMockSession();

		it("can read but not write", () => {
			// Can view
			expect(evaluateDeploymentPolicy(features, req("GET", "/app/org-1")).action).toBe("allow");

			// Cannot write
			expect(evaluateDeploymentPolicy(features, req("POST", "/api/brands")).action).toBe("block");

			// Auth route guard passes with session
			expect(evaluateAuthedRouteGuard(session)).toBe("allow");

			// Read-only middleware blocks server function writes
			expect(evaluateReadOnly(features.readOnly)).toBe("deny");
		});
	});

	describe("whitelabel unauthenticated user", () => {
		const features = WHITELABEL_FEATURES;

		it("is blocked by auth requirements", () => {
			// Deployment policy allows the request through (auth is not checked here)
			expect(evaluateDeploymentPolicy(features, req("GET", "/app/org-1")).action).toBe("allow");

			// Route guard redirects to login
			expect(evaluateAuthedRouteGuard(null)).toBe("redirect-to-login");
		});
	});

	describe("whitelabel authenticated admin", () => {
		const features = WHITELABEL_FEATURES;
		const session = createMockSession();

		it("can access admin and org routes", () => {
			// Deployment: all allowed
			expect(evaluateDeploymentPolicy(features, req("GET", "/admin")).action).toBe("allow");
			expect(evaluateDeploymentPolicy(features, req("POST", "/admin")).action).toBe("allow");

			// Auth: passes
			expect(evaluateRequireAdmin(true)).toBe("allow");
			expect(evaluateRequireOrgAccess(true)).toBe("allow");

			// Route guards: all pass
			expect(evaluateAuthedRouteGuard(session)).toBe("allow");
			expect(evaluateAdminRouteGuard(true)).toBe("allow");
			expect(evaluateBrandRouteGuard(true)).toBe("allow");
		});
	});

	describe("whitelabel authenticated non-admin", () => {
		it("can access org routes but not admin", () => {
			// Admin denied
			expect(evaluateRequireAdmin(false)).toBe("deny");
			expect(evaluateAdminRouteGuard(false)).toBe("not-found");

			// Org access depends on membership
			expect(evaluateRequireOrgAccess(true)).toBe("allow");
			expect(evaluateRequireOrgAccess(false)).toBe("deny");
			expect(evaluateBrandRouteGuard(true)).toBe("allow");
			expect(evaluateBrandRouteGuard(false)).toBe("not-found");
		});
	});

});
