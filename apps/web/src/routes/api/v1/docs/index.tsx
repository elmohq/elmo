import { createFileRoute, redirect } from "@tanstack/react-router";
import { API_DOCS_URL } from "@workspace/config/constants";

export const Route = createFileRoute("/api/v1/docs/")({
	beforeLoad: () => {
		throw redirect({ href: API_DOCS_URL });
	},
	component: () => null,
});
