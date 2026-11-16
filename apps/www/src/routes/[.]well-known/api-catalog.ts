import { createFileRoute } from "@tanstack/react-router";
import { apiCatalogResponse } from "@/lib/api-catalog";

export const Route = createFileRoute("/.well-known/api-catalog")({
	server: {
		handlers: {
			GET: ({ request }) => apiCatalogResponse(request),
			HEAD: ({ request }) => apiCatalogResponse(request),
		},
	},
});
