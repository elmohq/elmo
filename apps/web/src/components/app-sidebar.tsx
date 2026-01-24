"use client";

import * as React from "react";
import Link from "next/link";
import {
	IconCamera,
	IconChartBar,
	IconDashboard,
	IconDatabase,
	IconFileAi,
	IconFileDescription,
	IconFileWord,
	IconFolder,
	IconHelp,
	IconListDetails,
	IconReport,
	IconSearch,
	IconSettings,
	IconUsers,
	IconAward,
	IconList,
	IconLink,
} from "@tabler/icons-react";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { clientConfig } from "@/lib/config/client";
import { useBrand } from "@/hooks/use-brands";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const { brand } = useBrand();

	const navMain = [
		{
			title: "Dashboard",
			url: `/`,
			icon: IconDashboard,
		},
		...(brand?.onboarded
			? [
					{
						title: "Prompts",
						url: "/prompts",
						icon: IconListDetails,
					},
					{
						title: "Citations",
						url: "/citations",
						icon: IconLink,
					},
				]
			: []),
		// {
		// 	title: "Reputation",
		// 	url: "/reputation",
		// 	icon: IconAward,
		// },
		{
			title: "Settings",
			url: "/settings",
			icon: IconSettings,
		},
	];

	const data = {
		navMain,
	};

	return (
		<Sidebar collapsible="none" className="fixed left-0 top-0 h-screen border-r z-10" {...props}>
			<SidebarHeader className="border-b">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
							<Link href="/">
								<img src={clientConfig.branding.icon} alt="Logo" className="!size-5" />
								<span className="text-base font-semibold">{clientConfig.branding.name}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<NavMain items={data.navMain} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	);
}
