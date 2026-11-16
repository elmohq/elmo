/** W3C change-password-url: browsers and password managers probe this path. */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/change-password")({
	server: {
		handlers: {
			GET: () => new Response(null, { status: 302, headers: { Location: "/change-password" } }),
		},
	},
});
