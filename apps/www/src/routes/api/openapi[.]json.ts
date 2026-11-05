import { createFileRoute } from "@tanstack/react-router";
import { hostedSpec } from "@/lib/openapi";

export const Route = createFileRoute("/api/openapi.json")({
	server: {
		handlers: {
			GET: async () =>
				new Response(JSON.stringify(hostedSpec), {
					headers: { "Content-Type": "application/json" },
				}),
		},
	},
});
