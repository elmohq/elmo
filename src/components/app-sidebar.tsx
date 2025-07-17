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
} from "@tabler/icons-react";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { useBrand } from "@/hooks/use-brands";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	const data = {
		navMain: [
			{
				title: "Dashboard",
				url: `/`,
				icon: IconDashboard,
			},
			{
				title: "Prompts",
				url: "/prompts",
				icon: IconListDetails,
			},
			{
				title: "Reputation",
				url: "/reputation",
				icon: IconAward,
			},
			{
				title: "Settings",
				url: "/settings",
				icon: IconSettings,
			},
		],
	};

	return (
		<Sidebar collapsible="none" className="h-auto border-r" {...props}>
			<SidebarHeader className="border-b">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
							<Link href="/">
								<img src={WHITE_LABEL_CONFIG.icon} alt="Logo" className="!size-5" />
								<span className="text-base font-semibold">{WHITE_LABEL_CONFIG.name}</span>
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
