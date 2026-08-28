/**
 * /app/org/$org/settings layout — the app shell around the organization's own pages.
 *
 * Same shell as a brand's pages, minus the brand: the rail lists the
 * organization's brands instead of one brand's sections, so leaving settings goes
 * back into the dashboard rather than out to a picker.
 */
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { useOrganizationRoute } from "@/hooks/use-organizations";

export const Route = createFileRoute("/_authed/app/org/$org/settings")({
	// No crumb: the organization crumb above already leads here.
	component: OrganizationSettingsLayout,
});

function OrganizationSettingsLayout() {
	const { organization, isAdmin, hasReportAccess } = useOrganizationRoute();

	return (
		<AppShell
			sidebar={
				<AppSidebar
					scope="organization"
					isAdmin={isAdmin}
					hasReportAccess={hasReportAccess}
					organization={organization}
				/>
			}
			header={<SiteHeader organizationName={organization.name} />}
		>
			<PageContent>
				<Outlet />
			</PageContent>
		</AppShell>
	);
}
