/** RFC 8414: the endpoints an MCP client registers with and gets a token from. */
import { createFileRoute } from "@tanstack/react-router";
import { authorizationServerMetadata, corsPreflight } from "@/lib/mcp/discovery";

export const Route = createFileRoute("/.well-known/oauth-authorization-server/")({
	server: {
		handlers: {
			GET: ({ request }) => authorizationServerMetadata(request),
			OPTIONS: corsPreflight,
		},
	},
});
