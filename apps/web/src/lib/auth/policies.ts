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
import type { FeaturesConfig } from "@workspace/config/types";

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
/**
 * The api-key plugin endpoints that would otherwise let a signed-in user mint
 * or edit a key straight from the browser. Blocked outright: issuance goes
 * through the server function that validates the key's brand narrowing.
 */
const API_KEY_PLUGIN_MUTATIONS = new Set([
	"/api/auth/api-key/create",
	"/api/auth/api-key/update",
	"/api/auth/api-key/delete",
]);

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
}

/**
 * Evaluate request-level deployment access policy.
 *
 * Encodes the logic from `deploymentMiddleware` as a pure function:
 * 1. Read-only mode blocks API + server-function writes (except analytics events)
 * 2. Admin access control (disabled / readonly / full)
 * 3. OpenAPI spec serving
 *
 * /api/v1 authentication is deliberately absent: an organization key resolves
 * against the database, and this function is pure and synchronous by design.
 * createApiHandler is the gate for those routes.
 */
export function evaluateDeploymentPolicy(features: FeaturesConfig, request: RequestInfo): DeploymentPolicyResult {
	const { pathname, method } = request;
	const isWriteMethod = WRITE_METHODS.has(method);
	const isPlausibleEventRoute = pathname === "/api/plausible/event" || pathname === "/api/plausible/event/";

	const isApiRoute = pathname.startsWith("/api/");
	const isServerFunctionRoute = pathname.startsWith("/_server");
	const isAllowedAuthWrite = DEMO_AUTH_WRITE_ALLOWLIST.has(pathname);
	const isOrgPluginMutation = pathname.startsWith("/api/auth/organization/") && isWriteMethod;
	const isApiKeyPluginMutation = API_KEY_PLUGIN_MUTATIONS.has(pathname.replace(/\/$/, ""));
	// createApiHandler is the auth gate for /api/v1 (it needs a database lookup
	// this pure function can't do), and it enforces read-only there too, so its
	// refusal carries the same `{ error, message, code }` envelope as every
	// other /api/v1 error instead of a bare middleware body.
	const isPublicApiV1 = pathname.startsWith("/api/v1/");

	// 0a. Minting or editing an API key never happens over HTTP. The plugin
	// rejects `permissions` on any request carrying headers, so a browser could
	// only ever create a scopeless key — but a key's brand narrowing lives in
	// client-writable metadata, and the create path is where that gets validated
	// against the organization's brands. Routing every key through the server
	// function keeps that validation unskippable.
	if (isApiKeyPluginMutation) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "API keys are issued from the dashboard, not over this endpoint",
		};
	}

	// 0b. Better-auth org plugin mutations are blocked everywhere over HTTP.
	// Orgs are created server-side only — via the provisioning module
	// (local/demo/cloud create-brand, or the admin brands API whitelabel is
	// provisioned through) — and cloud team invitations go through server
	// functions that call auth.api in-process, so no mode needs these HTTP
	// endpoints.
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
	if (features.readOnly && isWriteMethod && !isPublicApiV1) {
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

	// 3. /api/v1 authentication is createApiHandler's job — an organization key
	// resolves against the database, which this function cannot do.
	return { action: "allow" };
}

// ============================================================================
// API Key Authentication
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks on API keys.
 * Returns true if the strings are equal, false otherwise.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
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
// Signup Allowlist
// ============================================================================

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
 * Evaluate whether the deployment allows the user to create brands from the UI.
 * Used by the create-brand server function. Local mode is the only mode that
 * allows it — whitelabel brands are provisioned through the admin API, demo is
 * read-only.
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
