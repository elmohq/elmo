import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/$org/$brand/prompts/edit")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/$org/$brand/settings/prompts",
			params: { org: params.org, brand: params.brand },
		});
	},
});
