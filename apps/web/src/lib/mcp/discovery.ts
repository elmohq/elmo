/**
 * The two OAuth documents an MCP client reads before it can authenticate.
 *
 * Both are the plugin's, but it serves them under the auth base path — and a
 * client only ever looks for them at the origin root, because that is where RFC
 * 8414 and RFC 9728 say they live. These handlers are the bridge; the content
 * is the plugin's, unedited.
 *
 * Each is served at its exact path and under a splat, because the two RFCs
 * disagree about how a resource with a path is spelled: a client may ask for
 * `/.well-known/oauth-protected-resource` or for
 * `/.well-known/oauth-protected-resource/api/mcp`, and both mean this one
 * server. Serving one and not the other is the difference between a client that
 * connects and a client that reports "no authorization server found".
 */
import { oauthProviderAuthServerMetadata } from "@workspace/lib/auth/server";
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

/** RFC 8414: the endpoints an MCP client registers with and gets a token from. */
export const authorizationServerMetadata = oauthProviderAuthServerMetadata(auth, { headers: CORS_HEADERS });

/**
 * RFC 9728: what `/api/mcp` is, and which authorization server guards it.
 *
 * The plugin answers this one from the request rather than from an endpoint, so
 * there is nothing to call: the request is handed back with its path intact and
 * the plugin recognizes it. A path it doesn't recognize gets the plugin's own
 * "not found" rather than a document describing a resource this server doesn't
 * serve.
 */
export const protectedResourceMetadata = async (request: Request): Promise<Response> => {
	const response = await auth.handler(request);
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
