"use client";

import * as React from "react";
import Link from "next/link";
import {
	IconDashboard,
	IconChartBar,
	IconLink,
	IconBuilding,
	IconBuildings,
	IconListDetails,
	IconCpu,
	IconTable,
	IconReport,
	IconTimeline,
	IconTool,
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
import { Logo } from "@/components/logo";
import { clientConfig } from "@/lib/config/client";
import { useBrand } from "@/hooks/use-brands";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	isAdmin?: boolean;
	hasReportAccess?: boolean;
	/** When true, only show admin section (no brand-specific nav) */
	adminOnly?: boolean;
}

export function AppSidebar({ isAdmin = false, hasReportAccess = false, adminOnly = false, ...props }: AppSidebarProps) {
	const { brand } = useBrand();
	const { setOpenMobile } = useSidebar();

	const showAdminSection = clientConfig.features.adminAccess && (isAdmin || hasReportAccess);

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
					title: "Citations",
					url: "/citations",
					icon: IconLink,
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
				],
			});
		}
	}

	// Admin section
	if (showAdminSection) {
		const adminItems = isAdmin
			? [
					{
						title: "Brands",
						url: "/admin",
						icon: IconTable,
						absolute: true,
					},
					{
						title: "Reports",
						url: "/reports",
						icon: IconReport,
						absolute: true,
					},
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
			: [
					{
						title: "Reports",
						url: "/reports",
						icon: IconReport,
						absolute: true,
					},
				];

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
						<Link href="/" onClick={() => setOpenMobile(false)}>
							<Logo iconClassName="!size-5" textClassName="text-base font-semibold" />
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
			</SidebarFooter>
		</Sidebar>
	);
}
