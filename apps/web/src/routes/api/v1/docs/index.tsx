import { createFileRoute, redirect } from "@tanstack/react-router";

const API_DOCS_URL = "https://www.elmohq.com/docs/api";

export const Route = createFileRoute("/api/v1/docs/")({
	beforeLoad: () => {
		throw redirect({ href: API_DOCS_URL });
	},
	server: {
		handlers: {
			GET: () => Response.redirect(API_DOCS_URL, 302),
		},
	},
});
