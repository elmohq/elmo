import {
	IconBriefcase,
	IconBuilding,
	IconBuildings,
	IconChartBar,
	IconCpu,
	IconCreditCard,
	IconDashboard,
	IconLink,
	IconListDetails,
	IconSitemap,
	IconSpeakerphone,
	IconTarget,
	IconUsers,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { FeaturesConfig } from "@workspace/config/types";
import { brandLinkParams, orgLinkParams } from "@workspace/lib/app-urls";
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
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import { NavAppInfo } from "@/components/nav-app-info";
import { type NavGroup, type NavItem, NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useViewer } from "@/hooks/use-route-context";
import { adminNavItems } from "@/lib/admin-nav";
import type { OrganizationSummary } from "@/lib/organizations/types";

type ScopeProps =
	| { scope: "brand"; organization: OrganizationSummary; brand: BrandWithPrompts }
	| { scope: "organization"; organization: OrganizationSummary }
	| { scope: "admin" | "account" };

function organizationGroup(organization: OrganizationSummary, features?: FeaturesConfig): NavGroup {
	const params = orgLinkParams(organization);
	const items: NavItem[] = [
		{ title: /* i18n */ "Organization", link: { to: "/app/org/$org/settings", params }, icon: IconBriefcase, exact: true },
		{ title: /* i18n */ "Brands", link: { to: "/app/org/$org/settings/brands", params }, icon: IconBuildings },
	];

	if (features?.teamInvites) {
		items.push({ title: /* i18n */ "Team", link: { to: "/app/org/$org/settings/members", params }, icon: IconUsers });
	}

	if (features?.billing) {
		items.push({ title: /* i18n */ "Billing", link: { to: "/app/org/$org/settings/billing", params }, icon: IconCreditCard });
	}

	return { label: /* i18n */ "Organization Settings", items };
}

function brandGroups(organization: OrganizationSummary, brand: BrandWithPrompts): NavGroup[] {
	const params = brandLinkParams(organization, brand);
	const dashboard: NavItem[] = [
		{ title: /* i18n */ "Overview", link: { to: "/app/org/$org/brand/$brand", params }, icon: IconDashboard, exact: true },
	];

	if (brand.onboarded) {
		dashboard.push(
			{ title: /* i18n */ "Visibility", link: { to: "/app/org/$org/brand/$brand/visibility", params }, icon: IconChartBar },
			{
				title: /* i18n */ "Share of Voice",
				link: { to: "/app/org/$org/brand/$brand/share-of-voice", params },
				icon: IconSpeakerphone,
			},
			{ title: /* i18n */ "Query Fan-Out", link: { to: "/app/org/$org/brand/$brand/query-fan-out", params }, icon: IconSitemap },
			{ title: /* i18n */ "Citations", link: { to: "/app/org/$org/brand/$brand/citations", params }, icon: IconLink },
			{ title: /* i18n */ "Opportunities", link: { to: "/app/org/$org/brand/$brand/opportunities", params }, icon: IconTarget },
		);
	}

	const groups: NavGroup[] = [{ label: /* i18n */ "Dashboard", items: dashboard }];

	if (brand.onboarded) {
		groups.push({
			label: /* i18n */ "Settings",
			items: [
				{ title: /* i18n */ "Brand", link: { to: "/app/org/$org/brand/$brand/settings/brand", params }, icon: IconBuilding },
				{
					title: /* i18n */ "Competitors",
					link: { to: "/app/org/$org/brand/$brand/settings/competitors", params },
					icon: IconBuildings,
				},
				{
					title: /* i18n */ "Prompts",
					link: { to: "/app/org/$org/brand/$brand/settings/prompts", params },
					icon: IconListDetails,
				},
				{ title: /* i18n */ "LLMs", link: { to: "/app/org/$org/brand/$brand/settings/llms", params }, icon: IconCpu },
			],
		});
	}

	return groups;
}

export function AppSidebar(props: ScopeProps) {
	const { scope } = props;
	const { setOpenMobile } = useSidebar();
	const { isAdmin, hasReportAccess } = useViewer();
	const features = useDeploymentFeatures();
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = features?.reportGeneration ?? true;

	// A gate page offers no destinations: every link would either 404 or bounce
	// the user straight back to the gate.
	const adminItems = scope === "account" ? [] : adminNavItems({ isAdmin, hasReportAccess, reportsEnabled });

	const groups: NavGroup[] = [
		...(props.scope === "brand" ? brandGroups(props.organization, props.brand) : []),
		...(props.scope === "organization" ? [organizationGroup(props.organization, features)] : []),
		...(scope === "admin" && adminItems.length > 0 ? [{ label: /* i18n */ "Admin", items: adminItems }] : []),
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
		<Sidebar variant="inset">
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
				<NavUser showOrganizations={scope !== "account"} adminItems={scope === "admin" ? [] : adminItems} />
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
