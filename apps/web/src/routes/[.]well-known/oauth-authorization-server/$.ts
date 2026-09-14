/**
 * The same document under an issuer path. This deployment's issuer is the bare
 * origin, so nothing needs the suffix — but clients that append the resource
 * path anyway get an answer rather than the SPA's HTML.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authorizationServerMetadata, corsPreflight } from "@/lib/mcp/discovery";

export const Route = createFileRoute("/.well-known/oauth-authorization-server/$")({
	server: {
		handlers: {
			GET: ({ request }) => authorizationServerMetadata(request),
			OPTIONS: corsPreflight,
		},
	},
});
