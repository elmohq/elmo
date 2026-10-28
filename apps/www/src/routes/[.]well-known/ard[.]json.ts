import { createFileRoute } from "@tanstack/react-router";
import { aiCatalog, aiCatalogHeaders } from "@/lib/ai-catalog";

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
