/** An OAuth token or an API key, resolved to one principal so a tool never
 * learns which arrived. */
import { verifyMcpAccessToken } from "@workspace/lib/auth/server";
import { db } from "@workspace/lib/db/db";
import { oauthClient, user } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { type ApiAuthFailure, type Principal, resolveApiAuth, type UserAuth } from "@/lib/auth/api-auth";

export type McpAuthResult = { auth: Principal } | { failure: ApiAuthFailure };

/** Named in the `401` challenge so an unconfigured client can find the
 * authorization server. */
export const MCP_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

/**
 * A signature says the token was issued, not that the grant still stands, so
 * everything it cannot see is read fresh. Not the browser session: these grants
 * carry `offline_access` and better-auth keeps them through a sign-out.
 */
async function resolveOAuthPrincipal(request: Request): Promise<UserAuth | null> {
	// Deferred as in api-auth: constructing auth reads APP_URL and throws without
	// it, which would make the tool registry unimportable.
	const [{ auth }, { listUserOrganizations }] = await Promise.all([
		import("@/lib/auth/server"),
		import("@/lib/auth/helpers"),
	]);

	let claims: Awaited<ReturnType<typeof verifyMcpAccessToken>>;
	try {
		claims = await verifyMcpAccessToken(auth, request);
	} catch {
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
	// A spent key is a different answer from one that was never a key.
	if (asKey.failure.code === "rate_limited") return asKey;

	const asUser = await resolveOAuthPrincipal(request);
	if (asUser) return { auth: asUser };

	return asKey;
}
