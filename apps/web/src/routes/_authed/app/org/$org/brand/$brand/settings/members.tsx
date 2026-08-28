/**
 * Members belong to the organization, not the brand. Kept as a redirect because
 * invitation emails and bookmarks still point at the brand-scoped path.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/members")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/app/org/$org/settings/members", params: { org: params.org } });
	},
});
