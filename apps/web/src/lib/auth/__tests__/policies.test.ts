/**
 * Access-control policy regression tests.
 *
 * This file is the single source of truth for "who can do what" across all
 * deployment modes. If a policy changes, a test here MUST break — that's
 * the whole point.
 *
 * Note on /api/v1: `evaluateDeploymentPolicy` no longer authenticates API v1
 * requests (see the file header in policies.ts) — that moved into
 * `createApiHandler`. The invariant that every v1 route actually calls
 * `createApiHandler` is guarded separately by
 * `src/lib/api/__tests__/v1-route-conformance.test.ts`, not by this file.
 *
 * Structure:
 *   1. Deployment request policy matrix  (deploymentMiddleware)
 *   2. Auth function-level policies       (requireAuth / requireAdmin / requireOrgAccess)
 *   3. Route guard policies               (_authed / admin / $brand beforeLoad)
 *   4. Read-only enforcement
 */
import { describe, expect, it } from "vitest";
import {
	evaluateAdminRouteGuard,
	evaluateAuthedRouteGuard,
	evaluateBrandRouteGuard,
	evaluateDeploymentPolicy,
	evaluateReadOnly,
	evaluateRequireAdmin,
	evaluateRequireCanCreateBrands,
	evaluateRequireOrgAccess,
	type RequestInfo,
} from "@/lib/auth/policies";
import { createMockSession, DEMO_FEATURES, LOCAL_FEATURES, WHITELABEL_FEATURES } from "@/test/mocks/auth";

// ============================================================================
// Helpers
// ============================================================================

function req(method: string, pathname: string): RequestInfo {
	return { pathname, method };
}

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

		// Deployment policy no longer gates /api/v1 auth at all — it falls
		// through to "allow" regardless of Authorization header. Actual
		// authentication happens in `createApiHandler` (resolveApiAuth), and
		// the invariant that every v1 route uses it is enforced by
		// v1-route-conformance.test.ts, not here.
		it("allows GET /api/v1/* with no auth info (auth is enforced by createApiHandler)", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/v1/prompts"));
			expect(result.action).toBe("allow");
		});

		it("allows POST /api/v1/* with no auth info (auth is enforced by createApiHandler)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/v1/brands"));
			expect(result.action).toBe("allow");
		});

		it("allows API v1 docs", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/v1/docs"));
			expect(result.action).toBe("allow");
		});

		it("serves OpenAPI spec", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/v1/openapi.json"));
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
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/plausible/event"));
			expect(result.action).toBe("allow");
		});

		it("exempts plausible events with trailing slash", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/plausible/event/"));
			expect(result.action).toBe("allow");
		});

		it("exempts better-auth sign-in from read-only (so visitors can log in)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/sign-in/email"));
			expect(result.action).toBe("allow");
		});

		it("exempts better-auth sign-out from read-only", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/sign-out"));
			expect(result.action).toBe("allow");
		});

		it("blocks POST /api/auth/change-password (not on the whitelist)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/change-password"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /api/auth/change-email (not on the whitelist)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/change-email"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /api/auth/update-user (not on the whitelist)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/update-user"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /api/auth/delete-user (not on the whitelist)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/delete-user"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /api/auth/forget-password (spam risk + not on whitelist)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/forget-password"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /api/auth/admin/create-user (admin plugin)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/admin/create-user"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("still allows GET /api/auth/get-session (reads are unaffected)", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/auth/get-session"));
			expect(result.action).toBe("allow");
		});

		// Read-only mode blocks /api/v1 writes unconditionally — before any
		// question of API-key auth is even reached (auth is a separate layer
		// now, in createApiHandler). These regression-test the demo-mode
		// deployment policy in isolation from that auth layer.
		it("blocks POST to /api/v1/* (read-only mode blocks all API writes)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/v1/prompts"));
			expect(result).toMatchObject({
				action: "block",
				status: 403,
				error: "Demo Mode",
			});
		});

		it("allows GET to /api/v1/*", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/v1/prompts"));
			expect(result.action).toBe("allow");
		});

		it("serves OpenAPI spec in demo mode", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/v1/openapi.json"));
			expect(result.action).toBe("serve-openapi");
		});

		it("blocks POST /api/v1/tools/analyze (demo can't burn LLM credit)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/v1/tools/analyze"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /api/v1/brands", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/v1/brands"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks PATCH /api/v1/brands/:brandId", () => {
			const result = evaluateDeploymentPolicy(features, req("PATCH", "/api/v1/brands/acme"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /api/v1/competitors", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/api/v1/competitors"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks PATCH /api/v1/competitors/:competitorId", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("PATCH", "/api/v1/competitors/01234567-89ab-cdef-0123-456789abcdef"),
			);
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks DELETE /api/v1/competitors/:competitorId", () => {
			const result = evaluateDeploymentPolicy(
				features,
				req("DELETE", "/api/v1/competitors/01234567-89ab-cdef-0123-456789abcdef"),
			);
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /_server/* analyze server fn (no LLM access via wizard either)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/_server/startAnalyzeBrandFn"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
		});

		it("blocks POST /_server/* analyze status poll (it is a POST, so demo mode rejects it)", () => {
			const result = evaluateDeploymentPolicy(features, req("POST", "/_server/getAnalyzeBrandStatusFn"));
			expect(result).toMatchObject({ action: "block", status: 403, error: "Demo Mode" });
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

		it("allows GET /api/v1/* (auth is enforced by createApiHandler)", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/v1/prompts"));
			expect(result.action).toBe("allow");
		});
	});

	// ────────────────────────────────────────────────────────────
	// Better-auth organization plugin mutations (blocked in all modes)
	// ────────────────────────────────────────────────────────────
	describe("org plugin mutations", () => {
		for (const [name, features] of [
			["local", LOCAL_FEATURES],
			["demo", DEMO_FEATURES],
			["whitelabel", WHITELABEL_FEATURES],
		] as const) {
			describe(`${name} mode`, () => {
				it("blocks POST /api/auth/organization/create", () => {
					const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/organization/create"));
					expect(result).toMatchObject({
						action: "block",
						status: 403,
						error: "Forbidden",
					});
				});

				it("blocks DELETE /api/auth/organization/:id", () => {
					const result = evaluateDeploymentPolicy(features, req("DELETE", "/api/auth/organization/abc"));
					expect(result).toMatchObject({ action: "block", status: 403 });
				});

				it("blocks POST /api/auth/organization/invite-member", () => {
					const result = evaluateDeploymentPolicy(features, req("POST", "/api/auth/organization/invite-member"));
					expect(result).toMatchObject({ action: "block", status: 403 });
				});

				it("allows GET /api/auth/organization/list (read endpoints unchanged)", () => {
					const result = evaluateDeploymentPolicy(features, req("GET", "/api/auth/organization/list"));
					expect(result.action).toBe("allow");
				});
			});
		}
	});

	// ────────────────────────────────────────────────────────────
	// Custom / edge-case feature combos
	// ────────────────────────────────────────────────────────────
	describe("custom feature combinations", () => {
		it("handles /api/v1/openapi.json with trailing slash", () => {
			const result = evaluateDeploymentPolicy(LOCAL_FEATURES, req("GET", "/api/v1/openapi.json/"));
			expect(result.action).toBe("serve-openapi");
		});

		it("allows /api/v1/docs with trailing slash", () => {
			const result = evaluateDeploymentPolicy(LOCAL_FEATURES, req("GET", "/api/v1/docs/"));
			expect(result.action).toBe("allow");
		});

		it("blocks TanStack server-function POST routes in read-only mode", () => {
			const result = evaluateDeploymentPolicy(DEMO_FEATURES, req("POST", "/_server"));
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

describe("evaluateRequireCanCreateBrands", () => {
	it("denies when canCreateBrands is false", () => {
		expect(evaluateRequireCanCreateBrands(false)).toBe("deny");
	});

	it("allows when canCreateBrands is true", () => {
		expect(evaluateRequireCanCreateBrands(true)).toBe("allow");
	});

	it("matches the expected per-mode flag", () => {
		// Local can create; demo and whitelabel cannot.
		expect(evaluateRequireCanCreateBrands(LOCAL_FEATURES.canCreateBrands)).toBe("allow");
		expect(evaluateRequireCanCreateBrands(DEMO_FEATURES.canCreateBrands)).toBe("deny");
		expect(evaluateRequireCanCreateBrands(WHITELABEL_FEATURES.canCreateBrands)).toBe("deny");
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
// 4. Cross-cutting: Full scenario tests
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
