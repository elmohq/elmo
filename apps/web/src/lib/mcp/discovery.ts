/**
 * The plugin serves these under the auth base path; a client looks at the origin
 * root. Each is served at its exact path and under a splat, because clients
 * disagree about whether the resource path is appended.
 */
import { oauthProviderAuthServerMetadata } from "@workspace/lib/auth/server";
import { auth } from "@/lib/auth/server";

/** Public by design: a client reads these before it holds any credential. */
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
	"Access-Control-Max-Age": "86400",
} as const;

export function corsPreflight(): Response {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export const authorizationServerMetadata = oauthProviderAuthServerMetadata(auth, { headers: CORS_HEADERS });

/** The plugin answers this from the request rather than an endpoint, so the
 * request is handed back with its path intact. */
export const protectedResourceMetadata = async (request: Request): Promise<Response> => {
	const response = await auth.handler(request);
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
