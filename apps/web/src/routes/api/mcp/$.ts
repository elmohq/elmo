/**
 * A splat rather than an exact route: TanStack matches `/api/mcp/$` for the
 * endpoint's own path too, so an exact route would never be reached.
 */
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";
import { MCP_RESOURCE_METADATA_PATH, resolveMcpAuth } from "@/lib/mcp/auth";
import { handleMcpRequest } from "@/lib/mcp/server";

/** From the auth config, not the request: a strict client refuses a challenge
 * naming a different origin than the document it points at. */
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
				// Without this a browser-based client reads the 401 but not the header
				// telling it where to authenticate.
				"Access-Control-Expose-Headers": "WWW-Authenticate",
			},
		},
	);
}

const NOT_FOUND = -32601;

async function handleMcp({ request }: { request: Request }): Promise<Response> {
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

	// The transport answers the methods the protocol defines and refuses the rest.
	return handleMcpRequest(resolved.auth, request);
}

function dispatch({
	request,
	params,
}: {
	request: Request;
	params: { _splat?: string };
}): Promise<Response> | Response {
	if (!params._splat) return handleMcp({ request });
	return Response.json({ jsonrpc: "2.0", id: null, error: { code: NOT_FOUND, message: "Not Found" } }, { status: 404 });
}

export const Route = createFileRoute("/api/mcp/$")({
	server: {
		handlers: {
			POST: dispatch,
			GET: dispatch,
			DELETE: dispatch,
		},
	},
});
