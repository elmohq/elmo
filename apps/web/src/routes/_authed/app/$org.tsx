/**
 * /app/$org layout — resolves the workspace every page below it belongs to.
 *
 * The segment carries the workspace slug. Ids resolve too (and canonicalize to
 * the slug), so anything holding an `organizationId` can link here without
 * looking the slug up first.
 *
 * A segment that names neither is tried as a brand id: `/app/$brand` links
 * predate workspaces being in the URL and still arrive from dunning emails,
 * bookmarks, and whitelabel parent dashboards. Those are rewritten to the
 * canonical path with the rest of the URL intact rather than 404'd.
 */
import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { resolveWorkspaceFn } from "@/server/workspaces";

export const Route = createFileRoute("/_authed/app/$org")({
	beforeLoad: async ({ params, location }): Promise<void> => {
		const result = await resolveWorkspaceFn({ data: { org: params.org } });

		if (!result.found) {
			if (!result.redirectToBrand) throw notFound();
			// `/app/nike/citations` → `/app/acme/nike/citations`: the old path put
			// the brand where the workspace now goes, so the workspace is inserted
			// ahead of it and the rest of the URL — brand included — is left alone.
			throw redirect({ href: `/app/${result.redirectToBrand.organizationSlug}${location.href.slice("/app".length)}` });
		}

		// The slug is the canonical form, so an id (or a stale slug) in the URL is
		// swapped for it rather than left to sit in the address bar.
		if (result.workspace.slug !== params.org) {
			const rest = location.href.slice(`/app/${params.org}`.length);
			throw redirect({ href: `/app/${result.workspace.slug}${rest}` });
		}
	},
	component: () => <Outlet />,
});
