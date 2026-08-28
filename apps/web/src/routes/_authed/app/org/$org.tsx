/**
 * /app/org/$org layout — resolves the workspace every page below it belongs to.
 *
 * The segment carries the workspace slug, or its id where no slug has been set.
 * Both resolve, and a workspace that has a slug canonicalizes to it, so anything
 * holding an `organizationId` can link here without looking the slug up first.
 *
 * The route tree resolves the org here and nowhere else: the workspace home, its
 * settings, the brand layout and every brand page read it from here. Server
 * functions still resolve it for themselves — each is reachable without passing
 * through this route, so each authorizes on its own.
 *
 * `beforeLoad` rather than `loader` because the brand layout needs the workspace
 * during its own `beforeLoad`, and sibling loaders run in parallel. That means
 * this runs on every navigation, filter changes included — so it goes through
 * the query cache, where a repeat within the minute costs nothing and the
 * mutations that change a workspace have something to invalidate.
 *
 * The loader hands the same value on, because a component reading a `beforeLoad`
 * result directly sees `undefined` while that beforeLoad re-runs.
 *
 * Nothing else is tried: `org` and `brand` are static segments, so a workspace
 * can be named anything without shadowing a route, and an unknown segment is
 * simply unknown. Links minted before this shape land on the 404, which resolves
 * them and offers the way across.
 */

import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { canonicalOrgHref, orgSegment } from "@workspace/lib/app-urls";
import { workspaceQueries } from "@/lib/workspaces/queries";
import type { WorkspaceRouteContext } from "@/lib/workspaces/types";

export const Route = createFileRoute("/_authed/app/org/$org")({
	beforeLoad: async ({ params, location, context }): Promise<WorkspaceRouteContext> => {
		const resolved = await context.queryClient.ensureQueryData(workspaceQueries.detail(params.org));
		if (!resolved) throw notFound();

		const canonical = orgSegment(resolved.workspace);
		if (canonical !== params.org) {
			throw redirect({ href: canonicalOrgHref(location, canonical) });
		}

		return resolved;
	},
	loader: ({ context }): WorkspaceRouteContext => ({
		workspace: context.workspace,
		isAdmin: context.isAdmin,
		hasReportAccess: context.hasReportAccess,
	}),
	component: () => <Outlet />,
});
