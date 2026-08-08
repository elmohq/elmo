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
import * as m from "@/paraglide/messages.js";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	isAdmin?: boolean;
	hasReportAccess?: boolean;
	/** When true, only show admin section (no brand-specific nav) */
	adminOnly?: boolean;
	/** Brand data from route loader — avoids a separate client-side fetch */
	brand?: BrandWithPrompts | null;
}

export function AppSidebar({
	isAdmin = false,
	hasReportAccess = false,
	adminOnly = false,
	brand,
	...props
}: AppSidebarProps) {
	const { setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = context.clientConfig?.features.reportGeneration ?? true;

	const showAdminSection = isAdmin || (hasReportAccess && reportsEnabled);

	const groups: NavGroup[] = [];

	// Dashboard section - only show if we have a brand context and not admin-only
	if (!adminOnly) {
		const dashboardItems = [
			{
				title: m.nav_overview(),
				url: "/",
				icon: IconDashboard,
			},
		];

		// Only show Visibility and Citations if the brand is onboarded
		if (brand?.onboarded) {
			dashboardItems.push(
				{
					title: m.nav_visibility(),
					url: "/visibility",
					icon: IconChartBar,
				},
				{
					title: m.nav_share_of_voice(),
					url: "/share-of-voice",
					icon: IconSpeakerphone,
				},
				{
					title: m.nav_query_fan_out(),
					url: "/query-fan-out",
					icon: IconSitemap,
				},
				{
					title: m.nav_citations(),
					url: "/citations",
					icon: IconLink,
				},
				{
					title: m.nav_opportunities(),
					url: "/opportunities",
					icon: IconTarget,
				},
			);
		}

		groups.push({
			label: m.nav_dashboard(),
			items: dashboardItems,
		});

		// Settings section - only show if onboarded
		if (brand?.onboarded) {
			groups.push({
				label: m.nav_settings(),
				items: [
					{
						title: m.nav_brand(),
						url: "/settings/brand",
						icon: IconBuilding,
					},
					{
						title: m.nav_competitors(),
						url: "/settings/competitors",
						icon: IconBuildings,
					},
					{
						title: m.nav_prompts(),
						url: "/settings/prompts",
						icon: IconListDetails,
					},
					{
						title: m.nav_llms(),
						url: "/settings/llms",
						icon: IconCpu,
					},
					...(context.clientConfig?.features.teamInvites
						? [{ title: m.nav_team(), url: "/settings/members", icon: IconUsers }]
						: []),
				],
			});
		}
	}

	// Admin section
	if (showAdminSection) {
		const reportsItem = {
			title: m.nav_reports(),
			url: "/reports",
			icon: IconReport,
			absolute: true,
		};
		const adminItems = isAdmin
			? [
					{
						title: m.nav_brands(),
						url: "/admin",
						icon: IconTable,
						absolute: true,
					},
					...(reportsEnabled ? [reportsItem] : []),
					{
						title: m.nav_workflows(),
						url: "/admin/workflows",
						icon: IconTimeline,
						absolute: true,
					},
					{
						title: m.nav_tools(),
						url: "/admin/tools",
						icon: IconTool,
						absolute: true,
					},
				]
			: [reportsItem];

		groups.push({
			label: m.nav_admin(),
			items: adminItems,
		});
	}

	return (
		<Sidebar
			variant="inset"
			labels={{
				title: m.ui_sidebar_title(),
				description: m.ui_sidebar_description(),
				toggle: m.ui_toggle_sidebar(),
				close: m.ui_close(),
			}}
			{...props}
		>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link to="/app" onClick={() => setOpenMobile(false)}>
								<Logo iconClassName="!size-5" />
								<div className="ml-auto group-data-[collapsible=icon]:hidden">
									<DemoModePill />
								</div>
							</Link>
						</SidebarMenuButton>
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
