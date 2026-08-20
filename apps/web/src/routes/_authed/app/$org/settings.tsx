/**
 * /app/$org/settings layout — the app shell around the workspace's own pages.
 *
 * Same shell as a brand's pages, minus the brand: the rail lists the
 * workspace's brands instead of one brand's sections, so leaving settings goes
 * back into the dashboard rather than out to a picker.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { hasReportAccess, isAdmin, requireAuthSession, requireOrganization } from "@/lib/auth/helpers";

interface WorkspaceShell {
	isAdmin: boolean;
	hasReportAccess: boolean;
	workspaceName: string;
}

const getWorkspaceShell = createServerFn({ method: "GET" })
	.validator(z.object({ org: z.string() }))
	.handler(async ({ data }): Promise<WorkspaceShell> => {
		const session = await requireAuthSession();
		const workspace = await requireOrganization(session.user.id, data.org);
		return {
			isAdmin: isAdmin(session),
			hasReportAccess: hasReportAccess(session),
			workspaceName: workspace.name,
		};
	});

export const Route = createFileRoute("/_authed/app/$org/settings")({
	loader: ({ params }): Promise<WorkspaceShell> => getWorkspaceShell({ data: { org: params.org } }),
	component: WorkspaceSettingsLayout,
});

function WorkspaceSettingsLayout() {
	const { isAdmin: admin, hasReportAccess: reports, workspaceName } = Route.useLoaderData();

	return (
		<SidebarProvider>
			<AppSidebar scope="workspace" isAdmin={admin} hasReportAccess={reports} workspaceName={workspaceName} />
			{/* `overflow-clip` rather than `overflow-hidden`: both clip to the rounded
			    corners, but `hidden` makes this a scroll container, which stops
			    descendants from sticking to the viewport (the site header included). */}
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-clip">
				<SiteHeader />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
							<Outlet />
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
