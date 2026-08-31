/**
 * The two OAuth documents an MCP client reads before it can authenticate.
 *
 * Both are served by the better-auth `mcp` plugin, but under the auth base path
 * — and a client only ever looks for them at the origin root, because that is
 * where RFC 8414 and RFC 9728 say they live. These handlers are the bridge; the
 * content is the plugin's.
 *
 * Each is served at its exact path and under a splat, because the two RFCs
 * disagree about how a resource with a path is spelled: a client may ask for
 * `/.well-known/oauth-protected-resource` or for
 * `/.well-known/oauth-protected-resource/api/mcp`, and both mean this one
 * server. Serving one and not the other is the difference between a client that
 * connects and a client that reports "no authorization server found".
 */
import { MCP_AUTHORIZE_PAGE, oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from "@workspace/lib/auth/server";
import { auth } from "@/lib/auth/server";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
	"Access-Control-Max-Age": "86400",
} as const;

/**
 * These are public documents by design — a client has to read them before it
 * holds anything to authenticate with — so the preflight is answered for any
 * origin, matching the headers the plugin already sets on the documents.
 */
export function corsPreflight(): Response {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const pluginAuthorizationServerMetadata = oAuthDiscoveryMetadata(auth);

/**
 * The plugin's document, with the authorization endpoint pointed at our own
 * page.
 *
 * The plugin's endpoint asks for consent only when the *client* requests it,
 * and issues a code immediately to any browser that already has a session — so
 * left alone, authorizing an MCP client is something that happens to someone
 * rather than something they do. `/auth/authorize` names what is asking and
 * waits for a click, then hands the request straight back.
 *
 * This is where a person is asked, not a gate: the plugin's endpoint stays
 * reachable, as every OAuth authorization endpoint is. What actually stops a
 * code being useful to anyone but the client that asked for it is PKCE and the
 * redirect URI it registered.
 */
export const authorizationServerMetadata = async (request: Request): Promise<Response> => {
	const response = await pluginAuthorizationServerMetadata(request);
	const metadata = (await response.json()) as Record<string, unknown> & { issuer?: string };
	// Built from the document's own issuer, not from the request. Every other
	// URL in here is derived from APP_URL, and a client that finds one field
	// naming a different origin from the rest refuses to connect — so a
	// misconfigured APP_URL should produce one wrong answer to fix, not two
	// that disagree.
	const issuer = metadata.issuer ?? new URL(request.url).origin;
	return Response.json(
		{ ...metadata, authorization_endpoint: new URL(MCP_AUTHORIZE_PAGE, issuer).toString() },
		{ headers: response.headers },
	);
};

export const protectedResourceMetadata = oAuthProtectedResourceMetadata(auth);
