/**
 * /admin layout - Admin section with access control
 *
 * Checks admin status; returns 404 if not admin.
 * Wraps admin routes with admin-specific sidebar.
 */
import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/_authed/admin")({
	staticData: { crumb: "Admin" },
	beforeLoad: ({ context }) => {
		if (!context.isAdmin) throw notFound();
	},
	component: AdminLayout,
});

function AdminLayout() {
	return (
		<AppShell sidebar={<AppSidebar scope="admin" />} header={<SiteHeader />}>
			<PageContent>
				<Outlet />
			</PageContent>
		</AppShell>
	);
}
