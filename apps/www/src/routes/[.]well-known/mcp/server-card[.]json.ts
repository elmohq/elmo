import { createFileRoute } from "@tanstack/react-router";
import { aiCatalogHeaders, mcpServerCard } from "@/lib/ai-catalog";

export const Route = createFileRoute("/.well-known/mcp/server-card.json")({
	server: {
		handlers: {
			GET: async () =>
				new Response(JSON.stringify(mcpServerCard), {
					headers: { "Content-Type": "application/mcp-server-card+json", ...aiCatalogHeaders },
				}),
		},
	},
});
