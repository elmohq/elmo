/**
 * The same document under the resource's own path, which is how a client that
 * follows RFC 9728 §3.1 spells it: `/.well-known/oauth-protected-resource/api/mcp`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { corsPreflight, protectedResourceMetadata } from "@/lib/mcp/discovery";

export const Route = createFileRoute("/.well-known/oauth-protected-resource/$")({
	server: {
		handlers: {
			GET: ({ request }) => protectedResourceMetadata(request),
			OPTIONS: corsPreflight,
		},
	},
});
