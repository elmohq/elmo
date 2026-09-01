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

/**
 * One policy for both documents and their preflight. They are public by design
 * — a client has to read them before it holds anything to authenticate with —
 * so any origin may, and a preflight that advertised different methods from the
 * documents it precedes would be its own small lie.
 */
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
 * page and the fields the plugin invents taken back out.
 *
 * The consent flow is enforced server-side (`mcpConsentGate` + `consentPage`);
 * this page is where the person is asked, and the plugin's endpoint is the one
 * that bounces a signed-out browser here.
 *
 * The plugin's document lies in three ways, and a strict client trusts the
 * document over the server:
 *
 *  - `userinfo_endpoint` and `jwks_uri` name endpoints the plugin never mounts
 *    — both `404`. Access tokens here are opaque strings verified by database
 *    lookup, not JWTs, so there is no key set and no userinfo to reach.
 *  - `id_token_signing_alg_values_supported: ["RS256"]` advertises an ID token
 *    this flow never issues.
 *
 * Stripping them says "this server has no such thing", which is true, rather
 * than pointing a client at a `404`.
 */
const PLUGIN_METADATA_LIES = ["userinfo_endpoint", "jwks_uri", "id_token_signing_alg_values_supported"] as const;

export const authorizationServerMetadata = async (request: Request): Promise<Response> => {
	const response = await pluginAuthorizationServerMetadata(request);
	// The plugin answers `null` rather than an error when it cannot build the
	// document. Passing its response through keeps that a degraded document
	// instead of a TypeError from reading `issuer` off nothing.
	if (!response.ok) return response;
	const metadata = (await response.json()) as (Record<string, unknown> & { issuer?: string }) | null;
	if (!metadata) return Response.json(metadata, { status: response.status, headers: CORS_HEADERS });

	// Built from the document's own issuer, not from the request. Every other
	// URL in here is derived from APP_URL, and a client that finds one field
	// naming a different origin from the rest refuses to connect — so a
	// misconfigured APP_URL should produce one wrong answer to fix, not two
	// that disagree.
	const issuer = metadata.issuer ?? new URL(request.url).origin;
	for (const field of PLUGIN_METADATA_LIES) delete metadata[field];
	// Our own headers, not the plugin's: the body is no longer the plugin's, and
	// a `Content-Length` or `ETag` it sets would describe a different one.
	return Response.json(
		{ ...metadata, authorization_endpoint: new URL(MCP_AUTHORIZE_PAGE, issuer).toString() },
		{ headers: CORS_HEADERS },
	);
};

const pluginProtectedResourceMetadata = oAuthProtectedResourceMetadata(auth);

/**
 * The plugin's protected-resource document, with the same honesty applied: it
 * also names a `jwks_uri` that does not exist and claims an RSA signing
 * algorithm for tokens that are not JWTs.
 */
export const protectedResourceMetadata = async (request: Request): Promise<Response> => {
	const response = await pluginProtectedResourceMetadata(request);
	if (!response.ok) return response;
	const metadata = (await response.json()) as Record<string, unknown> | null;
	if (!metadata) return Response.json(metadata, { status: response.status, headers: CORS_HEADERS });
	for (const field of PLUGIN_METADATA_LIES) delete metadata[field];
	return Response.json(metadata, { headers: CORS_HEADERS });
};
