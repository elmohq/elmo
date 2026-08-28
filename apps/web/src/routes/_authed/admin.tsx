/**
 * /admin layout - Admin section with access control
 *
 * Checks admin status; returns 404 if not admin.
 * Wraps admin routes with admin-specific sidebar.
 */
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { hasReportAccess, isAdmin, requireAuthSession } from "@/lib/auth/helpers";

const checkAdminAccess = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		isAdmin: boolean;
		hasReportAccess: boolean;
	}> => {
		const session = await requireAuthSession();
		return {
			isAdmin: isAdmin(session),
			hasReportAccess: hasReportAccess(session),
		};
	},
);

export const Route = createFileRoute("/_authed/admin")({
	beforeLoad: async () => {
		const { isAdmin, hasReportAccess } = await checkAdminAccess();

		if (!isAdmin) {
			throw notFound();
		}

		return { isAdmin, hasReportAccess };
	},
	component: AdminLayout,
});

function AdminLayout() {
	const { isAdmin, hasReportAccess } = Route.useRouteContext();

	return (
		<AppShell
			sidebar={<AppSidebar scope="admin" isAdmin={isAdmin} hasReportAccess={hasReportAccess} />}
			header={<SiteHeader />}
		>
			<PageContent>
				<Outlet />
			</PageContent>
		</AppShell>
	);
}
