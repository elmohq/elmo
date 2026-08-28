/**
 * /app/org/$org/settings layout — the app shell around the workspace's own pages.
 *
 * Same shell as a brand's pages, minus the brand: the rail lists the
 * workspace's brands instead of one brand's sections, so leaving settings goes
 * back into the dashboard rather than out to a picker.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import type { WorkspaceRouteContext } from "@/lib/workspaces/types";

export const Route = createFileRoute("/_authed/app/org/$org/settings")({
	// Handed on from the context the workspace layout resolved rather than read
	// from it in the component: a `beforeLoad` re-runs on every navigation, and a
	// component reading its result directly sees `undefined` while it does.
	loader: ({ context }): WorkspaceRouteContext => ({
		workspace: context.workspace,
		isAdmin: context.isAdmin,
		hasReportAccess: context.hasReportAccess,
	}),
	component: WorkspaceSettingsLayout,
});

function WorkspaceSettingsLayout() {
	const { workspace, isAdmin, hasReportAccess } = Route.useLoaderData();

	return (
		<AppShell
			sidebar={
				<AppSidebar scope="workspace" isAdmin={isAdmin} hasReportAccess={hasReportAccess} workspace={workspace} />
			}
			header={<SiteHeader workspaceName={workspace.name} />}
		>
			<PageContent>
				<Outlet />
			</PageContent>
		</AppShell>
	);
}
