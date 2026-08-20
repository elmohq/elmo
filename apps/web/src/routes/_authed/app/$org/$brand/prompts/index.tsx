import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/$org/$brand/prompts/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/$org/$brand/visibility",
			params: { org: params.org, brand: params.brand },
		});
	},
});
