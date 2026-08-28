/**
 * The segment resolves as a slug or an id, and canonicalizes to the slug, so
 * anything holding an `organizationId` can link here without looking one up.
 *
 * The org resolves here and nowhere else, but server functions still resolve it
 * for themselves: each is reachable without passing through this route.
 *
 * `beforeLoad` rather than `loader` because the brand layout needs the
 * organization during its own `beforeLoad`, and sibling loaders run in parallel.
 * The loader hands the same value on, because a component reading a
 * `beforeLoad` result directly sees `undefined` while that beforeLoad re-runs.
 */

import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { canonicalOrgHref, orgSegment } from "@workspace/lib/app-urls";
import { organizationQueries } from "@/lib/organizations/queries";
import type { OrganizationRouteContext } from "@/lib/organizations/types";

export const Route = createFileRoute("/_authed/app/org/$org")({
	beforeLoad: async ({ params, location, context }): Promise<OrganizationRouteContext> => {
		const resolved = await context.queryClient.ensureQueryData(organizationQueries.detail(params.org));
		if (!resolved) throw notFound();

		const canonical = orgSegment(resolved.organization);
		if (canonical !== params.org) {
			throw redirect({ href: canonicalOrgHref(location, canonical) });
		}

		return resolved;
	},
	loader: ({ context }): OrganizationRouteContext => ({
		organization: context.organization,
		isAdmin: context.isAdmin,
		hasReportAccess: context.hasReportAccess,
	}),
	component: () => <Outlet />,
});
