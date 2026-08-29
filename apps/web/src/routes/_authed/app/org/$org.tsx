/**
 * The segment resolves as a slug or an id, and canonicalizes to the slug, so
 * anything holding an `organizationId` can link here without looking one up.
 *
 * Resolved against the list the account menu already holds — a lookup in memory
 * rather than a round trip — the way the brand layout below resolves its own
 * segment against this organization's brands. Server functions still resolve
 * the organization for themselves: each is reachable without passing through
 * this route.
 *
 * `beforeLoad` rather than `loader` because the brand layout needs the
 * organization during its own `beforeLoad`, and sibling loaders run in parallel.
 * The loader hands the same value on, because a component reading a
 * `beforeLoad` result directly sees `undefined` while that beforeLoad re-runs.
 */

import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { canonicalOrgHref, resolveSegment } from "@workspace/lib/app-urls";
import { organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";

export const Route = createFileRoute("/_authed/app/org/$org")({
	beforeLoad: async ({ params, location, context }): Promise<{ organization: OrganizationSummary }> => {
		// `_authed` above has already redirected a signed-out caller, so a null
		// list here is a session that went away mid-navigation.
		const organizations = (await context.queryClient.ensureQueryData(organizationsQuery)) ?? [];
		const organization = resolveSegment(organizations, params.org);
		if (!organization) throw notFound();

		const canonical = organization.slug;
		if (canonical !== params.org) {
			throw redirect({ href: canonicalOrgHref(location, canonical) });
		}

		return { organization };
	},
	loader: ({ context }): OrganizationSummary => context.organization,
	component: () => <Outlet />,
});
