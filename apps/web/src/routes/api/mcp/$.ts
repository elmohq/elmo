/**
 * `/api/mcp` and anything under it.
 *
 * TanStack matches this route for the endpoint's own path too — the splat is
 * empty there — so it dispatches: the endpoint answers itself, and a path below
 * it gets a `404`. Without the second half an unmatched path falls through to
 * the SPA, and an MCP client parsing JSON-RPC gets a page of markup with a
 * `200` on it. The protocol has no subpaths, so anything reaching there is a
 * client pointed at the wrong place, answered in the same envelope the real
 * endpoint uses.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleMcp } from "@/routes/api/mcp";

function dispatch({
	request,
	params,
}: {
	request: Request;
	params: { _splat?: string };
}): Promise<Response> | Response {
	if (!params._splat) return handleMcp({ request });
	return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Not Found" } }, { status: 404 });
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
