/**
 * Pure policy evaluation functions for access control.
 *
 * These are framework-agnostic, side-effect-free functions that encode
 * the access control rules for each deployment mode. They are called
 * by the TanStack middleware / route guards and tested independently.
 *
 * The goal: every access-control decision in the app should be traceable
 * to one of these functions, making it trivial to write regression tests.
 *
 * Division of responsibility for `/api/v1/**`: this module (via
 * `deploymentMiddleware`) only decides *deployment-mode* policy — read-only
 * blocking, org-mutation blocking, OpenAPI serving. It does not authenticate
 * API requests. Authentication is resolved per-request inside
 * `createApiHandler` (see `@/lib/api/handler` and `resolveApiAuth` in
 * `@/lib/auth/api-auth`), which every v1 route handler is required to call.
 * That requirement is itself an invariant enforced by
 * `src/lib/api/__tests__/v1-route-conformance.test.ts` — since nothing here
 * gates `/api/v1/**` on auth anymore, a route that forgets to wrap itself in
 * `createApiHandler` would otherwise be silently unauthenticated.
 */
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
const DEMO_AUTH_WRITE_ALLOWLIST = new Set([
	"/api/auth/sign-in/email",
	"/api/auth/sign-in/email/",
	"/api/auth/sign-out",
	"/api/auth/sign-out/",
]);

export type DeploymentPolicyResult =
	| { action: "allow" }
	| { action: "block"; status: 403; error: string; message: string }
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
 * 1. Org-plugin mutation blocking (always)
 * 2. Read-only mode blocks API + server-function writes (except analytics events)
 * 3. OpenAPI spec serving
 *
 * Does NOT authenticate `/api/v1/**` requests — see the file header for why.
 */
export function evaluateDeploymentPolicy(features: FeaturesConfig, request: RequestInfo): DeploymentPolicyResult {
	const { pathname, method } = request;
	const isWriteMethod = WRITE_METHODS.has(method);
	const isPlausibleEventRoute = pathname === "/api/plausible/event" || pathname === "/api/plausible/event/";

	const isApiRoute = pathname.startsWith("/api/");
	const isServerFunctionRoute = pathname.startsWith("/_server");
	const isAllowedAuthWrite = DEMO_AUTH_WRITE_ALLOWLIST.has(pathname);
	const isOrgPluginMutation = pathname.startsWith("/api/auth/organization/") && isWriteMethod;

	// 1. Better-auth org plugin mutations are blocked everywhere. Orgs are
	// created server-side only — via the provisioning module (local/demo)
	// or via Auth0 sync (whitelabel). No mode needs these endpoints.
	if (isOrgPluginMutation) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "Organization mutations are not available via the API",
		};
	}

	// 2. Read-only mode: block every write except the explicit allowlist
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

	// 3. Serve OpenAPI spec
	const isOpenApi = pathname === "/api/v1/openapi.json" || pathname === "/api/v1/openapi.json/";

	if (isOpenApi && method === "GET") {
		return { action: "serve-openapi" };
	}

	// No further checks: /api/v1/** requests (other than the OpenAPI spec
	// above, and subject to the read-only block above) fall through to
	// "allow" here. Authentication happens in `createApiHandler`, not in
	// deployment policy — see the file header.
	return { action: "allow" };
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
 * Evaluate organization access requirement.
 * Used by server functions via `requireOrgAccess()` in auth helpers.
 */
export function evaluateRequireOrgAccess(hasAccess: boolean): "allow" | "deny" {
	return hasAccess ? "allow" : "deny";
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
