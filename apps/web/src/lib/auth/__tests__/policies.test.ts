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
import { describe, expect, it } from "vitest";
import {
	evaluateAdminRouteGuard,
	evaluateAuthedRouteGuard,
	evaluateDeploymentPolicy,
	evaluateReadOnly,
	evaluateRequireCanCreateBrands,
	type RequestInfo,
} from "@/lib/auth/policies";
import { createMockSession, DEMO_FEATURES, LOCAL_FEATURES, WHITELABEL_FEATURES } from "@/test/mocks/auth";

function req(method: string, pathname: string, authorizationHeader?: string): RequestInfo {
	return { pathname, method, authorizationHeader };
}

function apiReq(method: string, pathname: string): RequestInfo {
	return req(method, pathname, "Bearer some-token");
}

const VALID_API_KEY = "test-key-abc123";
const INVALID_API_KEY = "wrong-key";
const API_KEYS = [VALID_API_KEY, "another-key"];

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

		it("allows API v1 docs without key", () => {
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

		it("serves OpenAPI spec in demo mode", () => {
			const result = evaluateDeploymentPolicy(features, req("GET", "/api/v1/openapi.json"));
			expect(result.action).toBe("serve-openapi");
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

		it("allows API v1 with valid key", () => {
			const result = evaluateDeploymentPolicy(features, apiReq("GET", "/api/v1/prompts"));
			expect(result.action).toBe("allow");
		});
	});

	describe("api v1", () => {
		it("passes a request that carries a token through, in every mode", () => {
			for (const features of [LOCAL_FEATURES, DEMO_FEATURES, WHITELABEL_FEATURES]) {
				for (const [method, path] of [
					["GET", "/api/v1/prompts"],
					["POST", "/api/v1/prompts"],
					["POST", "/api/v1/brands"],
					["PATCH", "/api/v1/brands/acme"],
					["DELETE", "/api/v1/competitors/01234567-89ab-cdef-0123-456789abcdef"],
					["POST", "/api/v1/tools/analyze"],
				] as const) {
					expect(evaluateDeploymentPolicy(features, apiReq(method, path)).action, `${method} ${path}`).toBe("allow");
				}
			}
		});

		it("refuses a request carrying no usable token, without looking it up", () => {
			for (const header of [undefined, "", "Basic dXNlcjpwYXNz", "Bearer", "Bearer   "]) {
				const result = evaluateDeploymentPolicy(LOCAL_FEATURES, req("GET", "/api/v1/prompts", header));
				expect(result, `header: ${JSON.stringify(header)}`).toMatchObject({
					action: "block",
					status: 401,
					code: "unauthorized",
				});
			}
		});

		it("leaves the docs and the spec reachable without a token", () => {
			expect(evaluateDeploymentPolicy(LOCAL_FEATURES, req("GET", "/api/v1/docs")).action).toBe("allow");
			expect(evaluateDeploymentPolicy(LOCAL_FEATURES, req("GET", "/api/v1/openapi.json")).action).toBe("serve-openapi");
		});

		it("still serves the spec without a key", () => {
			expect(evaluateDeploymentPolicy(LOCAL_FEATURES, req("GET", "/api/v1/openapi.json")).action).toBe("serve-openapi");
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

	describe("mcp", () => {
		it("lets the transport through in every mode, because a read is a POST too", () => {
			for (const features of [LOCAL_FEATURES, DEMO_FEATURES, WHITELABEL_FEATURES]) {
				expect(evaluateDeploymentPolicy(features, req("POST", "/api/mcp")).action).toBe("allow");
			}
		});

		it("leaves an unauthenticated MCP call to the route, which answers with a challenge", () => {
			// A middleware block would be a bare 403 with no WWW-Authenticate, which
			// is what a client reads to discover it should sign in.
			expect(evaluateDeploymentPolicy(LOCAL_FEATURES, req("POST", "/api/mcp")).action).toBe("allow");
		});

		it("runs the OAuth flow wherever writes are allowed", () => {
			for (const features of [LOCAL_FEATURES, WHITELABEL_FEATURES]) {
				expect(evaluateDeploymentPolicy(features, req("GET", "/api/auth/oauth2/authorize")).action).toBe("allow");
				expect(evaluateDeploymentPolicy(features, req("POST", "/api/auth/oauth2/register")).action).toBe("allow");
				expect(evaluateDeploymentPolicy(features, req("POST", "/api/auth/oauth2/token")).action).toBe("allow");
			}
		});

		it("turns the OAuth flow off in a read-only deployment", () => {
			for (const path of ["/api/auth/oauth2/register", "/api/auth/oauth2/authorize", "/api/auth/oauth2/token"]) {
				expect(evaluateDeploymentPolicy(DEMO_FEATURES, req("POST", path))).toMatchObject({
					action: "block",
					status: 403,
				});
			}
			expect(evaluateDeploymentPolicy(DEMO_FEATURES, req("GET", "/api/auth/oauth2/authorize"))).toMatchObject({
				action: "block",
				status: 403,
			});
		});

		it("still serves MCP itself in a read-only deployment", () => {
			expect(evaluateDeploymentPolicy(DEMO_FEATURES, req("POST", "/api/mcp")).action).toBe("allow");
		});

		it("leaves a path under the MCP endpoint to the route, which answers 404", () => {
			expect(evaluateDeploymentPolicy(DEMO_FEATURES, req("POST", "/api/mcp/sub")).action).toBe("allow");
		});

		it("does not exempt a route that merely starts with the same characters", () => {
			expect(evaluateDeploymentPolicy(DEMO_FEATURES, req("POST", "/api/mcpx"))).toMatchObject({
				action: "block",
				status: 403,
			});
		});
	});

	// ────────────────────────────────────────────────────────────
	// Custom / edge-case feature combos
	// ────────────────────────────────────────────────────────────
	describe("custom feature combinations", () => {
		it("leaves API v1 authentication to createApiHandler", () => {
			const result = evaluateDeploymentPolicy(LOCAL_FEATURES, apiReq("GET", "/api/v1/prompts"));
			expect(result.action).toBe("allow");
		});

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

			// Route guards: all pass
			expect(evaluateAuthedRouteGuard(session)).toBe("allow");
			expect(evaluateAdminRouteGuard(true)).toBe("allow");
		});
	});

	describe("whitelabel authenticated non-admin", () => {
		it("can access org routes but not admin", () => {
			// Admin denied
			expect(evaluateAdminRouteGuard(false)).toBe("not-found");
		});
	});
});
