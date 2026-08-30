import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { useOrganization } from "@/hooks/use-organizations";

export const Route = createFileRoute("/_authed/app/org/$org/settings")({
	component: OrganizationSettingsLayout,
});

function OrganizationSettingsLayout() {
	const organization = useOrganization();

	return (
		<AppShell sidebar={<AppSidebar scope="organization" organization={organization} />} header={<SiteHeader />}>
			<PageContent>
				<Outlet />
			</PageContent>
		</AppShell>
	);
}
