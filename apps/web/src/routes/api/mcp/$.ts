/**
 * Anything under /api/mcp that matches no route.
 *
 * Without this an unmatched path falls through to the SPA, and an MCP client
 * parsing JSON-RPC gets a page of markup with a `200` on it. The endpoint is a
 * single URL — the protocol has no subpaths — so anything reaching here is a
 * client pointed at the wrong place, answered in the same envelope the real
 * endpoint uses.
 */
import { createFileRoute } from "@tanstack/react-router";

function notFound(): Response {
	return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Not Found" } }, { status: 404 });
}

export const Route = createFileRoute("/api/mcp/$")({
	server: {
		handlers: {
			POST: notFound,
			GET: notFound,
			DELETE: notFound,
		},
	},
});
