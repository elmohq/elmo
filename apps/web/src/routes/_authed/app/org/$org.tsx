/**
 * /app/org/$org layout — resolves the workspace every page below it belongs to.
 *
 * The segment carries the workspace slug, or its id where no slug has been set.
 * Both resolve, and a workspace that has a slug canonicalizes to it, so anything
 * holding an `organizationId` can link here without looking the slug up first.
 *
 * The resolved workspace goes into the route context so nothing below has to
 * treat the URL segment as an id — it may be either, and which one is not the
 * caller's problem.
 *
 * Nothing else is tried: `org` and `brand` are static segments, so a workspace
 * can be named anything without shadowing a route, and an unknown segment is
 * simply unknown. Links minted before this shape land on the 404, which resolves
 * them and offers the way across.
 */
import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { canonicalHref, ORG_SEGMENT_INDEX, orgSegment } from "@/lib/workspaces/paths";
import type { Workspace } from "@/lib/workspaces/types";
import { resolveWorkspaceFn } from "@/server/workspaces";

export const Route = createFileRoute("/_authed/app/org/$org")({
	beforeLoad: async ({ params, location }): Promise<{ workspace: Workspace }> => {
		const workspace = await resolveWorkspaceFn({ data: { org: params.org } });
		if (!workspace) throw notFound();

		const canonical = orgSegment(workspace);
		if (canonical !== params.org) {
			throw redirect({ href: canonicalHref(location, ORG_SEGMENT_INDEX, canonical) });
		}

		return { workspace };
	},
	component: () => <Outlet />,
});
