/**
 * /api/mcp - Model Context Protocol JSON-RPC endpoint.
 *
 * Uses raw handlers (NOT `createApiHandler`): MCP performs its own auth and
 * per-tool read-only enforcement inside `handleMcpPost`, so it must bypass the
 * admin-key check and the global read-only block that `createApiHandler` adds.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleMcpPost } from "@/lib/mcp/server";

const methodNotAllowed = () =>
	Response.json(
		{ error: "Method Not Allowed", message: "Use POST for MCP JSON-RPC" },
		{ status: 405, headers: { Allow: "POST" } },
	);

export const Route = createFileRoute("/api/mcp/")({
	server: {
		handlers: {
			POST: ({ request }) => handleMcpPost(request),
			GET: () => methodNotAllowed(),
			DELETE: () => methodNotAllowed(),
		},
	},
});
