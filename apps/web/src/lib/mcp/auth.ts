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
import { verifyMcpAccessToken } from "@workspace/lib/auth/server";
import { db } from "@workspace/lib/db/db";
import { oauthClient, user } from "@workspace/lib/db/schema";
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
 *
 * That is why the token's own `scope` claim is not consulted: none of these
 * scopes is an OAuth scope, so a token cannot carry one, and a request for one
 * is refused at the authorization endpoint. `mcp scopes are not oauth scopes`
 * in `__tests__/auth.test.ts` fails if that ever stops being true, because on
 * that day this function would be handing out capabilities a person declined.
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
 * A signature says the token was issued; it does not say the grant behind it
 * still stands. Everything a signature cannot see is read fresh here, so the
 * answers are the current ones rather than the ones that held at issue time:
 * the person still exists and is not banned, the client still exists and is
 * still enabled, and the workspaces are whichever they belong to now. That is
 * what lets a token outlive a team change without outliving the access that
 * came with it.
 *
 * Not checked, deliberately: whether the browser session that authorized this
 * is still open. These grants carry `offline_access`, which is the client
 * asking to keep working after the person closes the tab, and better-auth keeps
 * exactly those refresh tokens through a sign-out. Disabling the client is how
 * an operator ends one.
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

	let claims: Awaited<ReturnType<typeof verifyMcpAccessToken>>;
	try {
		claims = await verifyMcpAccessToken(auth, request);
	} catch {
		// Every rejection lands here, and a rejected token is simply not a
		// credential: the caller learns that from the challenge the route sends,
		// which says nothing about which check failed.
		return null;
	}

	const userId = typeof claims.sub === "string" ? claims.sub : null;
	const clientId = typeof claims.client_id === "string" ? claims.client_id : null;
	if (!userId || !clientId) return null;

	const [[account], [client]] = await Promise.all([
		db
			.select({ id: user.id, email: user.email, name: user.name, banned: user.banned })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1),
		db.select({ disabled: oauthClient.disabled }).from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1),
	]);
	if (!account || account.banned) return null;
	if (!client || client.disabled) return null;

	const organizations = await listUserOrganizations(account.id);
	return {
		kind: "user",
		userId: account.id,
		email: account.email ?? null,
		name: account.name ?? null,
		organizationIds: organizations.map((org) => org.id),
		clientId,
		expiresAt: typeof claims.exp === "number" ? new Date(claims.exp * 1000) : null,
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
