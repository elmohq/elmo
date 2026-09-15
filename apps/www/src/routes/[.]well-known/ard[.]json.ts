import { createFileRoute } from "@tanstack/react-router";
import { aiCatalog, aiCatalogHeaders } from "@/lib/ai-catalog";

// ARD moved off /.well-known/ai-catalog.json in v0.91; a conformant consumer
// only has to read this path.
export const Route = createFileRoute("/.well-known/ard.json")({
	server: {
		handlers: {
			GET: async () =>
				new Response(JSON.stringify(aiCatalog), {
					headers: { "Content-Type": "application/json", ...aiCatalogHeaders },
				}),
		},
	},
});
