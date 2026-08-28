import {
	IconBuilding,
	IconBuildingSkyscraper,
	IconBuildings,
	IconChartBar,
	IconCpu,
	IconCreditCard,
	IconDashboard,
	IconLink,
	IconListDetails,
	IconReport,
	IconSitemap,
	IconSpeakerphone,
	IconTable,
	IconTarget,
	IconTimeline,
	IconTool,
	IconUsers,
} from "@tabler/icons-react";
import { Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import type * as React from "react";
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import { NavAppInfo } from "@/components/nav-app-info";
import { type NavGroup, type NavItem, NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import type { OrganizationSummary } from "@/lib/organizations/types";

/**
 * How much of the app the shell around this page can reach:
 *  - "brand":     a brand's own pages, its organization's settings, plus admin for
 *                 those who have it
 *  - "organization": the organization's own pages (there is no brand in scope)
 *  - "admin":     the admin section only
 *  - "account":   nothing — the page is a gate the user has to clear first, so
 *                 the only things worth offering are who they are and how to leave
 */
export type SidebarScope = "brand" | "organization" | "admin" | "account";

/**
 * A union rather than nullable props, so nothing below carries a fallback for a
 * organization or brand the layout above has already resolved.
 */
type ScopeProps =
	| { scope: "brand"; organization: OrganizationSummary; brand: BrandWithPrompts }
	| { scope: "organization"; organization: OrganizationSummary }
	| { scope: "admin" | "account" };

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
	isAdmin?: boolean;
	hasReportAccess?: boolean;
} & ScopeProps;

/**
 * The label doesn't name the organization — the breadcrumb and the account menu
 * both already do. Team is listed everywhere; only inviting and removing are a
 * cloud feature, which the page itself reflects.
 */
function organizationGroup(organization: OrganizationSummary, features?: ClientConfig["features"]): NavGroup {
	const params = orgParams(organization);
	const items: NavItem[] = [
		{ title: "Organization", link: { to: "/app/org/$org/settings", params }, icon: IconBuildingSkyscraper },
		{ title: "Brands", link: { to: "/app/org/$org/settings/brands", params }, icon: IconBuildings },
		{ title: "Team", link: { to: "/app/org/$org/settings/members", params }, icon: IconUsers },
	];

	if (features?.billing) {
		items.push({ title: "Billing", link: { to: "/app/org/$org/settings/billing", params }, icon: IconCreditCard });
	}

	return { label: "Organization Settings", items };
}

function brandGroups(organization: OrganizationSummary, brand: BrandWithPrompts): NavGroup[] {
	const params = brandParams(organization, brand);
	const dashboard: NavItem[] = [
		{ title: "Overview", link: { to: "/app/org/$org/brand/$brand", params }, icon: IconDashboard },
	];

	// Everything but the overview reads results a brand has only once onboarded.
	if (brand.onboarded) {
		dashboard.push(
			{ title: "Visibility", link: { to: "/app/org/$org/brand/$brand/visibility", params }, icon: IconChartBar },
			{
				title: "Share of Voice",
				link: { to: "/app/org/$org/brand/$brand/share-of-voice", params },
				icon: IconSpeakerphone,
			},
			{ title: "Query Fan-Out", link: { to: "/app/org/$org/brand/$brand/query-fan-out", params }, icon: IconSitemap },
			{ title: "Citations", link: { to: "/app/org/$org/brand/$brand/citations", params }, icon: IconLink },
			{ title: "Opportunities", link: { to: "/app/org/$org/brand/$brand/opportunities", params }, icon: IconTarget },
		);
	}

	const groups: NavGroup[] = [{ label: "Dashboard", items: dashboard }];

	if (brand.onboarded) {
		groups.push({
			label: "Brand settings",
			items: [
				{ title: "Brand", link: { to: "/app/org/$org/brand/$brand/settings/brand", params }, icon: IconBuilding },
				{
					title: "Competitors",
					link: { to: "/app/org/$org/brand/$brand/settings/competitors", params },
					icon: IconBuildings,
				},
				{
					title: "Prompts",
					link: { to: "/app/org/$org/brand/$brand/settings/prompts", params },
					icon: IconListDetails,
				},
				{ title: "LLMs", link: { to: "/app/org/$org/brand/$brand/settings/llms", params }, icon: IconCpu },
			],
		});
	}

	return groups;
}

function adminGroup(isAdmin: boolean, reportsEnabled: boolean): NavGroup {
	const reportsItem: NavItem = { title: "Reports", link: { to: "/reports" }, icon: IconReport };
	if (!isAdmin) return { label: "Admin", items: [reportsItem] };

	return {
		label: "Admin",
		items: [
			{ title: "Brands", link: { to: "/admin" }, icon: IconTable },
			...(reportsEnabled ? [reportsItem] : []),
			{ title: "Workflows", link: { to: "/admin/workflows" }, icon: IconTimeline },
			{ title: "Tools", link: { to: "/admin/tools" }, icon: IconTool },
		],
	};
}

export function AppSidebar(props: AppSidebarProps) {
	const { isAdmin = false, hasReportAccess = false, scope, ...sidebarProps } = props;
	const { setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = context.clientConfig?.features.reportGeneration ?? true;

	// Stands in for an `inOrganization` flag, and carries the narrowing with it.
	const organization = props.scope === "brand" || props.scope === "organization" ? props.organization : null;

	// A gate page offers no destinations: every link would either 404 or bounce
	// the user straight back to the gate.
	const showAdminSection = scope !== "account" && (isAdmin || (hasReportAccess && reportsEnabled));

	const groups: NavGroup[] = [
		...(props.scope === "brand" ? brandGroups(props.organization, props.brand) : []),
		...(organization ? [organizationGroup(organization, context.clientConfig?.features)] : []),
		...(showAdminSection ? [adminGroup(isAdmin, reportsEnabled)] : []),
	];
	const brandmark = (
		<>
			<Logo iconClassName="!size-5" />
			<div className="ml-auto group-data-[collapsible=icon]:hidden">
				<DemoModePill />
			</div>
		</>
	);

	return (
		<Sidebar variant="inset" {...sidebarProps}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						{/* On a gate page the mark still says whose product this is, but it
						    leads nowhere — /app would redirect right back here. */}
						{scope === "account" ? (
							<div className="flex items-center gap-2 p-2">{brandmark}</div>
						) : (
							<SidebarMenuButton size="lg" render={<Link to="/app" onClick={() => setOpenMobile(false)} />}>
								{brandmark}
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain groups={groups} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
