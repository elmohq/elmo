/**
 * Who is calling `/api/mcp`.
 *
 * Two ways in, one principal out. Whichever a client uses, everything past this
 * module asks the same questions of it — which brands, which scopes — so a tool
 * never learns how its caller got here.
 *
 *  - **An OAuth token**, minted by the better-auth `mcp` plugin. The client
 *    registers itself, sends its user to sign in, and leaves holding a token
 *    that stands for that person. This is the path an interactive MCP client
 *    takes, and the only one that works without someone pasting a secret into a
 *    config file.
 *  - **An API key**, admin or organization, exactly as `/api/v1` accepts it.
 *    A key is what a scheduled job or a container has; it also lets an operator
 *    hand out a connection narrowed to one brand and a handful of scopes, which
 *    OAuth has no vocabulary for here.
 *
 * A key is tried first because it costs nothing to rule out — an admin key is a
 * string compare, and an unknown key is one indexed lookup — and because a
 * rate-limited key must be reported as rate-limited rather than falling through
 * to a second failure that reads as "invalid".
 */
import { db } from "@workspace/lib/db/db";
import { user } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import { type ApiAuthFailure, type Principal, resolveApiAuth, type UserAuth } from "@/lib/auth/api-auth";

export type McpAuthResult = { auth: Principal } | { failure: ApiAuthFailure };

/**
 * RFC 9728. A client that gets a `401` reads the `resource_metadata` challenge,
 * fetches this document, and learns which authorization server to talk to.
 */
export const MCP_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

/**
 * What a caller may do, in the one vocabulary the whole surface speaks.
 *
 * A person signed in over OAuth holds every scope, because scopes exist to
 * narrow a *key* below what its issuer can already do — and a session is that
 * person, who reaches all of this in the dashboard anyway. Narrowing here would
 * be a promise the browser doesn't keep.
 */
export function principalScopes(auth: Principal): Set<ApiScope> {
	if (auth.kind === "organization") return auth.scopes;
	return new Set(API_SCOPES);
}

/** How a tool names the caller in `whoami` and in a refusal. */
export function principalLabel(auth: Principal): string {
	switch (auth.kind) {
		case "admin":
			return "instance admin key";
		case "organization":
			return `API key for ${auth.organizationName}`;
		case "user":
			return auth.email ?? auth.userId;
	}
}

/**
 * Resolve an OAuth access token to the person holding it.
 *
 * Membership is read fresh rather than trusted from the token, so a token
 * outlives a team change without outliving the access that came with it.
 * Returns null for anything that isn't a live token — including one whose user
 * has since been deleted, which the plugin's own expiry check can't see.
 */
async function resolveOAuthPrincipal(request: Request): Promise<UserAuth | null> {
	// Deferred for the same reason api-auth defers it: constructing the auth
	// instance reads APP_URL and throws without it, which would make the tool
	// registry unimportable outside a configured environment. `helpers` is the
	// same dependency — it holds the auth instance at module scope.
	const [{ auth }, { listUserOrganizations }] = await Promise.all([
		import("@/lib/auth/server"),
		import("@/lib/auth/helpers"),
	]);

	let token: Awaited<ReturnType<typeof auth.api.getMcpSession>>;
	try {
		token = await auth.api.getMcpSession({ headers: request.headers });
	} catch (err) {
		// A resolver that throws must fail closed: an unavailable database is a
		// reason to reject a token, never a reason to accept one.
		console.error("[mcp] OAuth token verification failed:", err);
		return null;
	}
	if (!token?.userId) return null;

	const [account] = await db
		.select({ id: user.id, email: user.email, name: user.name })
		.from(user)
		.where(eq(user.id, token.userId))
		.limit(1);
	if (!account) return null;

	const organizations = await listUserOrganizations(account.id);
	return {
		kind: "user",
		userId: account.id,
		email: account.email ?? null,
		name: account.name ?? null,
		organizationIds: organizations.map((org) => org.id),
		clientId: token.clientId,
		expiresAt: token.accessTokenExpiresAt ? new Date(token.accessTokenExpiresAt) : null,
	};
}

export async function resolveMcpAuth(request: Request): Promise<McpAuthResult> {
	const asKey = await resolveApiAuth(request);
	if ("auth" in asKey) return { auth: asKey.auth };
	// A key that exists but has spent its budget is a different answer from one
	// that was never a key; only the latter is worth trying as a token.
	if (asKey.failure.code === "rate_limited") return asKey;

	const asUser = await resolveOAuthPrincipal(request);
	if (asUser) return { auth: asUser };

	// Neither read it. The key resolver's message is deliberately the same for
	// every way a credential can fail, so reusing it says nothing extra about
	// which of the two paths got closest.
	return asKey;
}
