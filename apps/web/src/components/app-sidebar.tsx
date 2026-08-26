import * as React from "react";
import { Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import {
	IconDashboard,
	IconChartBar,
	IconSpeakerphone,
	IconSitemap,
	IconTarget,
	IconLink,
	IconBuilding,
	IconBuildings,
	IconListDetails,
	IconCpu,
	IconTable,
	IconReport,
	IconTimeline,
	IconTool,
	IconUsers,
	IconCreditCard,
} from "@tabler/icons-react";

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
import { NavMain, type NavGroup } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { NavAppInfo } from "@/components/nav-app-info";
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";

/**
 * How much of the app the shell around this page can reach:
 *  - "brand":   a brand's own pages, plus admin for those who have it
 *  - "admin":   the admin section only (there is no brand in scope)
 *  - "account": nothing — the page is a gate the user has to clear first, so the
 *               only things worth offering are who they are and how to leave
 */
export type SidebarScope = "brand" | "admin" | "account";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	isAdmin?: boolean;
	hasReportAccess?: boolean;
	scope?: SidebarScope;
	/** Brand data from route loader — avoids a separate client-side fetch */
	brand?: BrandWithPrompts | null;
}

/** The sidebar's sections, decided entirely by scope, onboarding and access. */
function buildNavGroups(args: {
	scope: SidebarScope;
	brand?: BrandWithPrompts | null;
	isAdmin: boolean;
	showAdminSection: boolean;
	reportsEnabled: boolean;
	features?: ClientConfig["features"];
}): NavGroup[] {
	const { scope, brand, isAdmin, showAdminSection, reportsEnabled, features } = args;
	return [
		// Only a brand context has a dashboard; a gate page has no destinations.
		...(scope === "brand" ? brandGroups(brand, features) : []),
		...(showAdminSection ? [adminGroup(isAdmin, reportsEnabled)] : []),
	];
}

/** The dashboard and settings sections, both gated on the brand being onboarded. */
function brandGroups(brand: BrandWithPrompts | null | undefined, features?: ClientConfig["features"]): NavGroup[] {
	const groups: NavGroup[] = [];
	const dashboardItems = [
		{
			title: "Overview",
			url: "/",
			icon: IconDashboard,
		},
	];

	// Only show Visibility and Citations if the brand is onboarded
	if (brand?.onboarded) {
		dashboardItems.push(
			{
				title: "Visibility",
				url: "/visibility",
				icon: IconChartBar,
			},
			{
				title: "Share of Voice",
				url: "/share-of-voice",
				icon: IconSpeakerphone,
			},
			{
				title: "Query Fan-Out",
				url: "/query-fan-out",
				icon: IconSitemap,
			},
			{
				title: "Citations",
				url: "/citations",
				icon: IconLink,
			},
			{
				title: "Opportunities",
				url: "/opportunities",
				icon: IconTarget,
			},
		);
	}

	groups.push({
		label: "Dashboard",
		items: dashboardItems,
	});

	// Settings section - only show if onboarded
	if (brand?.onboarded) {
		groups.push({
			label: "Settings",
			items: [
				{
					title: "Brand",
					url: "/settings/brand",
					icon: IconBuilding,
				},
				{
					title: "Competitors",
					url: "/settings/competitors",
					icon: IconBuildings,
				},
				{
					title: "Prompts",
					url: "/settings/prompts",
					icon: IconListDetails,
				},
				{
					title: "LLMs",
					url: "/settings/llms",
					icon: IconCpu,
				},
				...(features?.teamInvites ? [{ title: "Team", url: "/settings/members", icon: IconUsers }] : []),
				...(features?.billing ? [{ title: "Billing", url: "/settings/billing", icon: IconCreditCard }] : []),
			],
		});
	}

	return groups;
}

/** Admins get the whole console; report access alone gets only Reports. */
function adminGroup(isAdmin: boolean, reportsEnabled: boolean): NavGroup {
	const reportsItem = { title: "Reports", url: "/reports", icon: IconReport, absolute: true };
	if (!isAdmin) return { label: "Admin", items: [reportsItem] };

	return {
		label: "Admin",
		items: [
			{ title: "Brands", url: "/admin", icon: IconTable, absolute: true },
			...(reportsEnabled ? [reportsItem] : []),
			{ title: "Workflows", url: "/admin/workflows", icon: IconTimeline, absolute: true },
			{ title: "Tools", url: "/admin/tools", icon: IconTool, absolute: true },
		],
	};
}

export function AppSidebar({
	isAdmin = false,
	hasReportAccess = false,
	scope = "brand",
	brand,
	...props
}: AppSidebarProps) {
	const { setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = context.clientConfig?.features.reportGeneration ?? true;

	// A gate page offers no destinations: every link would either 404 or bounce
	// the user straight back to the gate.
	const showAdminSection = scope !== "account" && (isAdmin || (hasReportAccess && reportsEnabled));

	const groups = buildNavGroups({
		scope,
		brand,
		isAdmin,
		showAdminSection,
		reportsEnabled,
		features: context.clientConfig?.features,
	});
	const brandmark = (
		<>
			<Logo iconClassName="!size-5" />
			<div className="ml-auto group-data-[collapsible=icon]:hidden">
				<DemoModePill />
			</div>
		</>
	);

	return (
		<Sidebar variant="inset" {...props}>
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
				<NavUser canSwitchBrand={scope !== "account"} />
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
