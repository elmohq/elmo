import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { canonicalOrgHref, resolveSegment } from "@workspace/lib/app-urls";
import { organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";

export const Route = createFileRoute("/_authed/app/org/$org")({
	beforeLoad: async ({ params, location, context }): Promise<{ organization: OrganizationSummary }> => {
		const { organizations } = await context.queryClient.ensureQueryData(organizationsQuery);
		const organization = resolveSegment(organizations, params.org);
		if (!organization) throw notFound();

		const canonical = organization.slug;
		if (canonical !== params.org) {
			throw redirect({ href: canonicalOrgHref(location, canonical) });
		}

		return { organization };
	},
	component: () => <Outlet />,
});
