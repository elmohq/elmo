/** RFC 9728: what `/api/mcp` is, and which authorization server guards it. */
import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, protectedResourceMetadata } from "@/lib/mcp/discovery";

export const Route = createFileRoute("/.well-known/oauth-protected-resource/")({
	server: {
		handlers: {
			GET: ({ request }) => protectedResourceMetadata(request),
			OPTIONS: corsPreflight,
		},
	},
});
