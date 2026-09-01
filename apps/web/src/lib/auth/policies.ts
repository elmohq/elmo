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

/**
 * The MCP OAuth flow, which a read-only deployment does not run.
 *
 * Dynamic client registration is an unauthenticated write by design — that is
 * what lets an MCP client introduce itself — and a public demo is exactly where
 * an unauthenticated write nobody has to sign in for gets abused. Turning the
 * flow off is also the honest answer: a token minted here would act as the
 * shared demo account, which can't write anything anyway.
 *
 * `/api/mcp` itself stays open; a read-only deployment answers it with an API
 * key and offers only the tools that read.
 */
const MCP_OAUTH_PREFIX = "/api/auth/oauth2/";

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
			/** Set on /api/v1 blocks, which answer the same envelope every route does. */
			code?: string;
	  }
	| { action: "redirect"; url: string }
	| { action: "serve-openapi" };

export interface RequestInfo {
	pathname: string;
	method: string;
	authorizationHeader?: string | null;
}

/**
 * The better-auth endpoints that are refused before anything else looks at the
 * request, whatever the deployment mode.
 *
 * Each of these is an HTTP door onto something the app only ever does
 * server-side, so the rule is "closed" rather than "closed unless". Split out
 * of evaluateDeploymentPolicy because the list grows and the policy below it
 * reads better without it inline.
 */
function refuseAuthEndpoint(
	features: FeaturesConfig,
	pathname: string,
	isWriteMethod: boolean,
): DeploymentPolicyResult | null {
	// Minting or editing an API key never happens over HTTP. The plugin rejects
	// `permissions` on any request carrying headers, so a browser could only ever
	// create a scopeless key — but a key's brand narrowing lives in
	// client-writable metadata, and the create path is where that gets validated
	// against the organization's brands. Routing every key through the server
	// function keeps that validation unskippable.
	if (API_KEY_PLUGIN_MUTATIONS.has(pathname.replace(/\/$/, ""))) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "API keys are issued from the dashboard, not over this endpoint",
		};
	}

	// Org plugin mutations are blocked everywhere over HTTP. Orgs are created
	// server-side only — via the provisioning module (local/demo/cloud
	// create-brand, or the admin brands API whitelabel is provisioned through) —
	// and cloud team invitations go through server functions that call auth.api
	// in-process, so no mode needs these HTTP endpoints.
	if (pathname.startsWith("/api/auth/organization/") && isWriteMethod) {
		return {
			action: "block",
			status: 403,
			error: "Forbidden",
			message: "Organization mutations are not available via the API",
		};
	}

	// The MCP OAuth flow, off wherever writes are.
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
 * Surfaces that enforce read-only at their own gate, in their own error
 * vocabulary, and so must reach it.
 *
 *  - `/api/v1/*` — `createApiHandler` refuses the write with the same
 *    `{ error, message, code }` envelope every other error on that surface
 *    carries, rather than a bare middleware body.
 *  - `/api/mcp` — every MCP call is a POST, including the ones that only read,
 *    so refusing the transport here would take the reads with it. The tool
 *    registry is what decides: it drops every writer in a read-only deployment.
 *    Matched exactly, not as a prefix — the endpoint is one URL with no
 *    subpaths, and the splat route under it answers `404` to everything else,
 *    so a prefix exemption would cover paths that police nothing.
 *
 * A list rather than a chain of `&&  !isSomething`, so a third surface is a
 * data change and not a fourth clause in a boolean.
 */
const SELF_POLICING_WRITE_PREFIXES = ["/api/v1/"];
const SELF_POLICING_WRITE_PATHS = [MCP_PATH];

function refusesItsOwnWrites(pathname: string): boolean {
	const normalized = pathname.replace(/\/$/, "");
	return (
		SELF_POLICING_WRITE_PATHS.includes(normalized) ||
		SELF_POLICING_WRITE_PREFIXES.some((prefix) => `${pathname}/`.startsWith(prefix))
	);
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
	const { pathname, method, authorizationHeader } = request;
	const isWriteMethod = WRITE_METHODS.has(method);
	const isPlausibleEventRoute = pathname === "/api/plausible/event" || pathname === "/api/plausible/event/";

	const isApiRoute = pathname.startsWith("/api/");
	const isServerFunctionRoute = pathname.startsWith("/_server");
	const isAllowedAuthWrite = DEMO_AUTH_WRITE_ALLOWLIST.has(pathname);
	const isPublicApiV1 = pathname.startsWith("/api/v1/");
	const isPublicApiV1Doc = pathname === "/api/v1/docs" || pathname === "/api/v1/docs/";

	// 0. The better-auth endpoints no deployment exposes over HTTP.
	const authEndpointRefusal = refuseAuthEndpoint(features, pathname, isWriteMethod);
	if (authEndpointRefusal) return authEndpointRefusal;

	// 1. Read-only mode: block every write except the explicit allowlist
	// (analytics events + the two auth endpoints a visitor needs to use), and
	// except the surfaces that refuse writes themselves.
	if (features.readOnly && isWriteMethod && !refusesItsOwnWrites(pathname)) {
		if ((isApiRoute || isServerFunctionRoute) && !isPlausibleEventRoute && !isAllowedAuthWrite) {
			return {
				action: "block",
				status: 403,
				error: READ_ONLY_ERROR,
				message: READ_ONLY_MESSAGE,
			};
		}
	}

	// 2. Serve OpenAPI spec
	const isOpenApi = pathname === "/api/v1/openapi.json" || pathname === "/api/v1/openapi.json/";

	if (isOpenApi && method === "GET") {
		return { action: "serve-openapi" };
	}

	// 3. A coarse gate for /api/v1. Resolving a token needs a database lookup,
	// which this function cannot do, so createApiHandler stays the real gate —
	// but a request with no bearer at all can be turned away here.
	//
	// The invariant this exists to hold: **nothing under /api/v1 ever answers
	// with HTML.** Without it a request the router doesn't match falls through
	// to the SPA, and a client parsing JSON gets a page of markup instead of an
	// error it can read.
	if (isPublicApiV1 && !isPublicApiV1Doc) {
		if (!hasBearerToken(authorizationHeader)) {
			return {
				action: "block",
				status: 401,
				error: "Unauthorized",
				message: "Valid API key required as Bearer token in Authorization header",
				code: "unauthorized",
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
 * Whether the request carries a non-empty Bearer token — a shape check only.
 * Whether that token is *valid* needs a database lookup and belongs to
 * createApiHandler.
 */
function hasBearerToken(header: string | null | undefined): boolean {
	return typeof header === "string" && header.startsWith("Bearer ") && header.slice(7).trim().length > 0;
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
