/**
 * Pure policy evaluation functions for access control.
 *
 * These are framework-agnostic, side-effect-free functions that encode
 * the access control rules for each deployment mode. They are called
 * by the TanStack middleware / route guards and tested independently.
 *
 * The goal: every access-control decision in the app should be traceable
 * to one of these functions, making it trivial to write regression tests.
 */
import { timingSafeEqual } from "node:crypto";
import type { DeploymentMode, FeaturesConfig } from "@workspace/config/types";

// ============================================================================
// Deployment Request Policy
// ============================================================================

/** HTTP methods that mutate state */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Exact better-auth endpoints that remain writable in read-only mode.
 *
 * Whitelist rather than blacklist: every other `/api/auth/**` write is
 * rejected in demo, so new better-auth endpoints (from plugins we add or
 * library upgrades) are blocked by default instead of silently becoming
 * reachable. Only sign-in and sign-out need to work for a demo visitor
 * — everything else (change-password, change-email, update-user,
 * delete-user, forget-password, admin plugin endpoints, etc.) has no
 * business mutating the shared demo account.
 */
const DEMO_AUTH_WRITE_ALLOWLIST = new Set([
	"/api/auth/sign-in/email",
	"/api/auth/sign-in/email/",
	"/api/auth/sign-out",
	"/api/auth/sign-out/",
]);

export type DeploymentPolicyResult =
	| { action: "allow" }
	| { action: "block"; status: 401 | 403; error: string; message: string }
	| { action: "redirect"; url: string }
	| { action: "serve-openapi" };

export interface RequestInfo {
	pathname: string;
	method: string;
	authorizationHeader?: string | null;
}

/**
 * Evaluate request-level deployment access policy.
 *
 * Encodes the logic from `deploymentMiddleware` as a pure function:
 * 1. Read-only mode blocks API + server-function writes (except analytics events)
 * 2. Admin access control (disabled / readonly / full)
 * 3. OpenAPI spec serving
 * 4. API v1 key authentication
 */
export function evaluateDeploymentPolicy(
	features: FeaturesConfig,
	request: RequestInfo,
	options?: { adminApiKeys?: string[] },
): DeploymentPolicyResult {
	const { pathname, method, authorizationHeader } = request;
	const isWriteMethod = WRITE_METHODS.has(method);
	const isPlausibleEventRoute = pathname === "/api/plausible/event" || pathname === "/api/plausible/event/";

	const isApiRoute = pathname.startsWith("/api/");
	const isServerFunctionRoute = pathname.startsWith("/_server");
	const isAllowedAuthWrite = DEMO_AUTH_WRITE_ALLOWLIST.has(pathname);
	const isOrgPluginMutation = pathname.startsWith("/api/auth/organization/") && isWriteMethod;

	// 0. Better-auth org plugin mutations are blocked everywhere over HTTP.
	// Orgs are created server-side only — via the provisioning module
	// (local/demo/cloud create-brand) or Auth0 sync (whitelabel) — and cloud
	// team invitations go through server functions that call auth.api
	// in-process, so no mode needs these HTTP endpoints.
	if (isOrgPluginMutation) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "Organization mutations are not available via the API",
		};
	}

	// 1. Read-only mode: block every write except the explicit allowlist
	// (analytics events + the two auth endpoints a visitor needs to use).
	if (features.readOnly && isWriteMethod) {
		if ((isApiRoute || isServerFunctionRoute) && !isPlausibleEventRoute && !isAllowedAuthWrite) {
			return {
				action: "block",
				status: 403,
				error: "Demo Mode",
				message: "Write operations are disabled in demo mode",
			};
		}
	}

	// 2. Serve OpenAPI spec
	const isOpenApi = pathname === "/api/v1/openapi.json" || pathname === "/api/v1/openapi.json/";

	if (isOpenApi && method === "GET") {
		return { action: "serve-openapi" };
	}

	// 3. Public API v1 key authentication (except docs and spec)
	const isPublicApiV1 = pathname.startsWith("/api/v1/");
	const isPublicApiV1Doc = pathname === "/api/v1/docs" || pathname === "/api/v1/docs/";

	if (isPublicApiV1 && !isPublicApiV1Doc && !isOpenApi) {
		const keyResult = evaluateApiKeyAuth(authorizationHeader, options?.adminApiKeys ?? []);
		if (keyResult !== "allow") {
			return {
				action: "block",
				status: 401,
				error: keyResult.error,
				message: keyResult.message,
			};
		}
	}

	return { action: "allow" };
}

// ============================================================================
// API Key Authentication
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks on API keys.
 * Returns true if the strings are equal, false otherwise.
 */
function timingSafeStringEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		// Compare against itself to consume constant time, then return false
		timingSafeEqual(bufA, bufA);
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

/**
 * Evaluate Bearer token API key authentication.
 * Returns "allow" or an object with error details.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function evaluateApiKeyAuth(
	authorizationHeader: string | null | undefined,
	adminApiKeys: string[],
): "allow" | { error: string; message: string } {
	if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
		return {
			error: "Unauthorized",
			message: "Valid API key required as Bearer token in Authorization header",
		};
	}

	const token = authorizationHeader.substring(7);

	if (adminApiKeys.length === 0 || !adminApiKeys.some((key) => timingSafeStringEqual(key, token))) {
		return {
			error: "Unauthorized",
			message: "Invalid API key",
		};
	}

	return "allow";
}

/**
 * Parse comma-separated ADMIN_API_KEYS env var into a trimmed, non-empty array.
 * Single source of truth — use this everywhere instead of inline parsing.
 */
export function getAdminApiKeys(): string[] {
	return (process.env.ADMIN_API_KEYS || "")
		.split(",")
		.map((key) => key.trim())
		.filter(Boolean);
}

/**
 * Validate a Bearer API key from a request.
 * Convenience wrapper for use in API route handlers.
 */
export function validateApiKeyFromRequest(request: Request): boolean {
	const authHeader = request.headers.get("Authorization");
	return evaluateApiKeyAuth(authHeader, getAdminApiKeys()) === "allow";
}

// ============================================================================
// Auth Function-Level Policies
// ============================================================================

/**
 * Evaluate admin access requirement.
 * Used by `requireAdminMiddleware`.
 */
export function evaluateRequireAdmin(isAdmin: boolean): "allow" | "deny" {
	return isAdmin ? "allow" : "deny";
}

/**
 * Which org a newly created brand attaches to, in pure form.
 *
 * An explicit choice must be one the caller belongs to. Without one, a single
 * membership is unambiguous and anything more is not — the caller is asked
 * rather than picked for, because the answer decides who can see the brand and
 * which org is billed for it. Never falls back to an arbitrary membership.
 */
export type BrandOrgChoice =
	| { ok: true; organizationId: string }
	| { ok: false; reason: "no-organization" | "forbidden" | "ambiguous" };

export function resolveBrandOrganization(
	memberOrgIds: readonly string[],
	requestedOrgId: string | undefined,
): BrandOrgChoice {
	if (memberOrgIds.length === 0) return { ok: false, reason: "no-organization" };
	if (requestedOrgId) {
		return memberOrgIds.includes(requestedOrgId)
			? { ok: true, organizationId: requestedOrgId }
			: { ok: false, reason: "forbidden" };
	}
	if (memberOrgIds.length === 1) return { ok: true, organizationId: memberOrgIds[0] };
	return { ok: false, reason: "ambiguous" };
}

/**
 * Evaluate read-only mode enforcement.
 * Used by `readOnlyMiddleware` for server functions.
 */
export function evaluateReadOnly(readOnly: boolean): "allow" | "deny" {
	return readOnly ? "deny" : "allow";
}

/**
 * Evaluate whether the viewer chooses which platforms a brand is tracked on.
 *
 * Not a plan question — cloud sells the choice and local runs it, so both keep
 * it. Demo refuses every write, and in whitelabel the picks, and the provider
 * bills behind them, belong to the agency rather than the customer looking at
 * the page. Entitlements can't answer this: they read "unlimited" for local,
 * demo and whitelabel alike.
 */
export function evaluatePlatformPicksEditable(mode: DeploymentMode, features: FeaturesConfig): "allow" | "deny" {
	if (features.readOnly) return "deny";
	return mode === "whitelabel" ? "deny" : "allow";
}

/**
 * Evaluate whether prompts may carry per-prompt grounded ("premium") model
 * assignments.
 *
 * Cloud sells grounded calls from a metered pool, one prompt/model pair at a
 * time. Everywhere else the same models are tracked by picking their targets on
 * the LLMs page — a self-hosted brand can absolutely run grounded Claude; it
 * just runs it for the whole brand. A per-prompt assignment there would be a
 * second, invisible way to spend the operator's money, and the run policy
 * ignores it anyway.
 */
export function evaluatePremiumAssignable(mode: DeploymentMode): "allow" | "deny" {
	return mode === "cloud" ? "allow" : "deny";
}

/**
 * Evaluate whether the deployment allows the user to create brands from the UI.
 * Used by the create-brand server function. Local mode is the only mode that
 * allows it — whitelabel orgs come from Auth0, demo is read-only.
 */
export function evaluateRequireCanCreateBrands(canCreateBrands: boolean): "allow" | "deny" {
	return canCreateBrands ? "allow" : "deny";
}

// ============================================================================
// Route Guard Policies
// ============================================================================

export type RouteGuardResult = "allow" | "redirect-to-login" | "not-found";

/**
 * Evaluate the `/_authed` layout guard.
 * Mirrors the `beforeLoad` in `_authed.tsx`.
 */
export function evaluateAuthedRouteGuard(session: unknown | null): RouteGuardResult {
	if (!session) return "redirect-to-login";
	return "allow";
}

/**
 * Evaluate the `/admin` layout guard.
 * Mirrors the `beforeLoad` in `_authed/admin.tsx`.
 */
export function evaluateAdminRouteGuard(isAdmin: boolean): RouteGuardResult {
	if (!isAdmin) return "not-found";
	return "allow";
}

/**
 * Evaluate the `/app/$brand` layout guard.
 * Mirrors the `loader` in `_authed/app/$brand.tsx`.
 */
export function evaluateBrandRouteGuard(hasAccess: boolean): RouteGuardResult {
	return hasAccess ? "allow" : "not-found";
}
