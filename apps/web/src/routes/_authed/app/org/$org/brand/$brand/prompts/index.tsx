import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/prompts/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/org/$org/brand/$brand/visibility",
			params: { org: params.org, brand: params.brand },
		});
	},
});
