/**
 * /app/org/$org layout — resolves the workspace every page below it belongs to.
 *
 * The segment carries the workspace slug, or its id where no slug has been set.
 * Both resolve, and a workspace that has a slug canonicalizes to it, so anything
 * holding an `organizationId` can link here without looking the slug up first.
 *
 * This is the only place the org is resolved. Everything below — the workspace
 * home, its settings, the brand layout and every brand page — reads the result
 * from route context, so a page costs one workspace lookup however deep it sits.
 * `beforeLoad` rather than `loader` because the brand layout needs it during its
 * own `beforeLoad`, and sibling loaders run in parallel.
 *
 * Nothing else is tried: `org` and `brand` are static segments, so a workspace
 * can be named anything without shadowing a route, and an unknown segment is
 * simply unknown. Links minted before this shape land on the 404, which resolves
 * them and offers the way across.
 */

import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { canonicalHref, ORG_SEGMENT_INDEX, orgSegment } from "@workspace/lib/app-urls";
import type { WorkspaceContext } from "@/lib/workspaces/types";
import { resolveWorkspaceFn } from "@/server/workspaces";

export const Route = createFileRoute("/_authed/app/org/$org")({
	beforeLoad: async ({ params, location }): Promise<WorkspaceContext> => {
		const resolved = await resolveWorkspaceFn({ data: { org: params.org } });
		if (!resolved) throw notFound();

		const canonical = orgSegment(resolved.workspace);
		if (canonical !== params.org) {
			throw redirect({ href: canonicalHref(location, ORG_SEGMENT_INDEX, canonical) });
		}

		return resolved;
	},
	component: () => <Outlet />,
});
