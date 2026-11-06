import { createFileRoute } from "@tanstack/react-router";
import { discoveryHeaders, poppyManifest } from "@/lib/agent-discovery";

export const Route = createFileRoute("/.well-known/poppy.json")({
	server: {
		handlers: {
			GET: async () => new Response(JSON.stringify(poppyManifest), { headers: discoveryHeaders }),
		},
	},
});
