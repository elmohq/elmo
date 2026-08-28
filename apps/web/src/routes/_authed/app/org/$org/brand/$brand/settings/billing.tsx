/**
 * Billing belongs to the organization, not the brand. Kept as a redirect because
 * dunning emails and bookmarks still point at the brand-scoped path.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/billing")({
	beforeLoad: ({ params }) => {
		throw redirect({ to: "/app/org/$org/settings/billing", params: { org: params.org } });
	},
});
