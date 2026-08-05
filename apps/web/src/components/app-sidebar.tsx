import {
	IconBuilding,
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
import { type NavGroup, NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	isAdmin?: boolean;
	hasReportAccess?: boolean;
	/** When true, only show admin section (no brand-specific nav) */
	adminOnly?: boolean;
	/** Brand data from route loader — avoids a separate client-side fetch */
	brand?: BrandWithPrompts | null;
	/** Workspace context for organization-level navigation without a brand route. */
	organizationId?: string;
}

export function AppSidebar({
	isAdmin = false,
	hasReportAccess = false,
	adminOnly = false,
	brand,
	organizationId,
	...props
}: AppSidebarProps) {
	const { setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = context.clientConfig?.features.reportGeneration ?? true;

	const showAdminSection = isAdmin || (hasReportAccess && reportsEnabled);
	const workspaceOrganizationId = organizationId ?? brand?.organizationId;

	const groups: NavGroup[] = [];

	// Dashboard section - only show if we have a brand context and not admin-only
	if (!adminOnly) {
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
					...(context.clientConfig?.features.teamInvites
						? [{ title: "Team", url: "/settings/members", icon: IconUsers }]
						: []),
				],
			});
		}
	}

	if (context.clientConfig?.features.billing && workspaceOrganizationId) {
		groups.push({
			label: "Workspace",
			items: [
				{
					title: "Plan & usage",
					url: `/app/workspaces/${encodeURIComponent(workspaceOrganizationId)}/billing`,
					icon: IconCreditCard,
					absolute: true,
				},
			],
		});
	}

	// Admin section
	if (showAdminSection) {
		const reportsItem = {
			title: "Reports",
			url: "/reports",
			icon: IconReport,
			absolute: true,
		};
		const adminItems = isAdmin
			? [
					{
						title: "Brands",
						url: "/admin",
						icon: IconTable,
						absolute: true,
					},
					...(reportsEnabled ? [reportsItem] : []),
					{
						title: "Workflows",
						url: "/admin/workflows",
						icon: IconTimeline,
						absolute: true,
					},
					{
						title: "Tools",
						url: "/admin/tools",
						icon: IconTool,
						absolute: true,
					},
				]
			: [reportsItem];

		groups.push({
			label: "Admin",
			items: adminItems,
		});
	}

	return (
		<Sidebar variant="inset" {...props}>
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
