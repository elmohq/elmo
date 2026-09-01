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
import { MCP_PATH } from "@workspace/config/constants";
import type { FeaturesConfig } from "@workspace/config/types";
import { READ_ONLY_ERROR, READ_ONLY_MESSAGE } from "@/lib/read-only-errors";

/** HTTP methods that mutate state */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Blocked outright: issuance goes through the server function that validates
 * the key's brand narrowing. */
const API_KEY_PLUGIN_MUTATIONS = new Set([
	"/api/auth/api-key/create",
	"/api/auth/api-key/update",
	"/api/auth/api-key/delete",
]);

/** Client registration is an unauthenticated write by design, which a public
 * demo is the wrong place for. `/api/mcp` itself stays open. */
const MCP_OAUTH_PREFIX = "/api/auth/oauth2/";

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
	| {
			action: "block";
			status: 401 | 403 | 404;
			error: string;
			message: string;
			code?: string;
	  }
	| { action: "redirect"; url: string }
	| { action: "serve-openapi" };

export interface RequestInfo {
	pathname: string;
	method: string;
	authorizationHeader?: string | null;
}

/** Doors onto things the app only ever does server-side. */
function refuseAuthEndpoint(
	features: FeaturesConfig,
	pathname: string,
	isWriteMethod: boolean,
): DeploymentPolicyResult | null {
	if (API_KEY_PLUGIN_MUTATIONS.has(pathname.replace(/\/$/, ""))) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "API keys are issued from the dashboard, not over this endpoint",
		};
	}

	if (pathname.startsWith("/api/auth/organization/") && isWriteMethod) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "Organization mutations are not available via the API",
		};
	}

	if (features.readOnly && pathname.startsWith(MCP_OAUTH_PREFIX)) {
		return {
			action: "block",
			status: 403,
			error: READ_ONLY_ERROR,
			message: "Sign-in for MCP is disabled here; connect with an API key instead",
		};
	}

	return null;
}

/**
 * Every MCP call is a POST including the reads, so refusing the transport would
 * take those with it; the tool registry drops the writers instead. Paths under
 * the endpoint are included so a request that matches no route answers 404 in
 * every mode rather than 403 in the read-only ones.
 */
const SELF_POLICING_WRITE_PREFIXES = ["/api/v1/", `${MCP_PATH}/`];
const SELF_POLICING_WRITE_PATHS = [MCP_PATH];

function refusesItsOwnWrites(pathname: string): boolean {
	const normalized = pathname.replace(/\/$/, "");
	return (
		SELF_POLICING_WRITE_PATHS.includes(normalized) ||
		SELF_POLICING_WRITE_PREFIXES.some((prefix) => `${pathname}/`.startsWith(prefix))
	);
}

/** Read-only mode blocks API and server-function writes. Analytics events and
 *  the demo auth allowlist stay open; the self-policing routes refuse their own
 *  writes deeper in. */
function refuseReadOnlyWrite(
	features: FeaturesConfig,
	pathname: string,
	isWriteMethod: boolean,
): DeploymentPolicyResult | null {
	if (!features.readOnly || !isWriteMethod || refusesItsOwnWrites(pathname)) return null;
	if (!pathname.startsWith("/api/") && !pathname.startsWith("/_server")) return null;

	const isPlausibleEventRoute = pathname === "/api/plausible/event" || pathname === "/api/plausible/event/";
	if (isPlausibleEventRoute || DEMO_AUTH_WRITE_ALLOWLIST.has(pathname)) return null;

	return { action: "block", status: 403, error: READ_ONLY_ERROR, message: READ_ONLY_MESSAGE };
}

/** Coarse: this only keeps an unmatched /api/v1 request from falling through to
 *  the SPA and answering with HTML. */
function refuseUnauthenticatedApiV1(
	pathname: string,
	authorizationHeader: string | null | undefined,
): DeploymentPolicyResult | null {
	if (!pathname.startsWith("/api/v1/")) return null;
	if (pathname === "/api/v1/docs" || pathname === "/api/v1/docs/") return null;
	if (hasBearerToken(authorizationHeader)) return null;

	return {
		action: "block",
		status: 401,
		error: "Unauthorized",
		message: "Valid API key required as Bearer token in Authorization header",
		code: "unauthorized",
	};
}

/**
 * Evaluate request-level deployment access policy.
 *
 * Encodes the logic from `deploymentMiddleware` as a pure function:
 * 1. Read-only mode blocks API + server-function writes (except analytics events)
 * 2. Admin access control (disabled / readonly / full)
 * 3. OpenAPI spec serving
 *
 * No /api/v1 authentication: resolving a key needs a database, and this is pure
 * and synchronous. createApiHandler is the gate for those routes.
 */
export function evaluateDeploymentPolicy(features: FeaturesConfig, request: RequestInfo): DeploymentPolicyResult {
	const { pathname, method, authorizationHeader } = request;
	const isWriteMethod = WRITE_METHODS.has(method);

	const authEndpointRefusal = refuseAuthEndpoint(features, pathname, isWriteMethod);
	if (authEndpointRefusal) return authEndpointRefusal;

	const readOnlyRefusal = refuseReadOnlyWrite(features, pathname, isWriteMethod);
	if (readOnlyRefusal) return readOnlyRefusal;

	const isOpenApi = pathname === "/api/v1/openapi.json" || pathname === "/api/v1/openapi.json/";
	if (isOpenApi && method === "GET") return { action: "serve-openapi" };

	return refuseUnauthenticatedApiV1(pathname, authorizationHeader) ?? { action: "allow" };
}

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
 * A shape check only. Whether the token is *valid* needs a database lookup and
 * belongs to createApiHandler.
 */
function hasBearerToken(header: string | null | undefined): boolean {
	return typeof header === "string" && header.startsWith("Bearer ") && header.slice(7).trim().length > 0;
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

/** Evaluate admin access requirement. */
export function evaluateRequireAdmin(isAdmin: boolean): "allow" | "deny" {
	return isAdmin ? "allow" : "deny";
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
 * Used by the create-brand server function. True in local and cloud, which sells
 * brands by the plan — whitelabel brands are provisioned through the admin API,
 * demo is read-only.
 */
export function evaluateRequireCanCreateBrands(canCreateBrands: boolean): "allow" | "deny" {
	return canCreateBrands ? "allow" : "deny";
}

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
