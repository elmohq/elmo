import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/app/org/$org/brand/$brand/settings/brand",
			params: { org: params.org, brand: params.brand },
		});
	},
});
