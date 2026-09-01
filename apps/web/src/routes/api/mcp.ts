/**
 * POST /api/mcp — the Model Context Protocol endpoint.
 *
 * One URL, Streamable HTTP, stateless. An MCP client points at it, presents
 * either an OAuth token or an API key, and gets the tools that credential is
 * allowed — see lib/mcp/tools.ts for what those are and lib/mcp/auth.ts for how
 * a caller is resolved.
 *
 * A request with no usable credential is refused in the JSON-RPC envelope
 * carrying `WWW-Authenticate`, which is how a client discovers it should run
 * the OAuth flow: the header points at the protected-resource document, which
 * names the authorization server, which advertises its own endpoints. Answering
 * a bare `401` instead would leave an unconfigured client with nowhere to go.
 */
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { MCP_RESOURCE_METADATA_PATH, resolveMcpAuth } from "@/lib/mcp/auth";
import { handleMcpRequest } from "@/lib/mcp/server";

/**
 * The origin the metadata challenge names. Taken from the auth config rather
 * than the request: the resource identifier the rest of the flow advertises is
 * built from that config, and a challenge naming a different origin than the
 * document it points at is exactly the disagreement a strict client refuses on.
 */
function mcpResourceMetadataUrl(): string {
	const baseURL = typeof auth.options.baseURL === "string" ? auth.options.baseURL : undefined;
	return new URL(MCP_RESOURCE_METADATA_PATH, baseURL ?? "http://localhost:3000").toString();
}

function unauthorized(message: string): Response {
	const challenge = `Bearer resource_metadata="${mcpResourceMetadataUrl()}"`;
	return Response.json(
		{ jsonrpc: "2.0", id: null, error: { code: -32001, message } },
		{
			status: 401,
			headers: {
				"WWW-Authenticate": challenge,
				// Without this a browser-based client can read the 401 but not the
				// header that tells it where to authenticate.
				"Access-Control-Expose-Headers": "WWW-Authenticate",
			},
		},
	);
}

async function handler({ request }: { request: Request }): Promise<Response> {
	const resolved = await resolveMcpAuth(request);
	if ("failure" in resolved) {
		if (resolved.failure.status === 429) {
			return Response.json(
				{ jsonrpc: "2.0", id: null, error: { code: -32003, message: resolved.failure.message } },
				{
					status: 429,
					headers: { "Retry-After": String(resolved.failure.retryAfterSeconds ?? 60) },
				},
			);
		}
		return unauthorized(resolved.failure.message);
	}

	// The transport answers the methods the protocol defines and refuses the
	// rest, so the verb table lives with the protocol rather than here.
	return handleMcpRequest(resolved.auth, request);
}

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			POST: handler,
			GET: handler,
			DELETE: handler,
		},
	},
});
