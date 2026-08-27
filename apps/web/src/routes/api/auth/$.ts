import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				return await auth.handler(request);
			},
			POST: async ({ request }: { request: Request }) => {
				return await auth.handler(request);
			},
		},
	},
});
