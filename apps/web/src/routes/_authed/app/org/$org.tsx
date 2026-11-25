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
			throw redirect({ href: canonicalOrgHref(location, canonical), replace: true });
		}

		const pinned = organization.brands.find((brand) => brand.id === organization.pinnedBrandId);
		if (pinned) {
			const segment = pinned.slug ?? pinned.id;
			const prefix = `/app/org/${canonical}/brand/${segment}`;
			const here = location.pathname;
			if (here !== prefix && !here.startsWith(`${prefix}/`)) {
				throw redirect({ to: "/app/org/$org/brand/$brand", params: { org: canonical, brand: segment } });
			}
		}

		return { organization };
	},
	loader: ({ context }): { organization: OrganizationSummary } => ({ organization: context.organization }),
	component: () => <Outlet />,
});
