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

export const Route = createFileRoute("/_authed/app/org/$org/settings")({
	component: WorkspaceSettingsLayout,
});

function WorkspaceSettingsLayout() {
	const { workspace, isAdmin, hasReportAccess } = Route.useRouteContext();

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
