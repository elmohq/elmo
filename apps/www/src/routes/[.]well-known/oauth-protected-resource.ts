import { createFileRoute } from "@tanstack/react-router";
import { discoveryHeaders, protectedResourceMetadata } from "@/lib/agent-discovery";

export const Route = createFileRoute("/.well-known/oauth-protected-resource")({
	server: {
		handlers: {
			GET: async () => new Response(JSON.stringify(protectedResourceMetadata), { headers: discoveryHeaders }),
		},
	},
});
