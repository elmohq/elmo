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
import { NavDocuments } from "@/components/nav-documents";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { WHITE_LABEL_CONFIG } from "@/lib/white-label";

const data = {
	navMain: [
		{
			title: "Dashboard",
			url: "#",
			icon: IconDashboard,
		},
		{
			title: "Reputation",
			url: "#",
			icon: IconAward,
		},
		{
			title: "Prompts",
			url: "#",
			icon: IconListDetails,
		},
	],
	// navSecondary: [
	// 	{
	// 		title: "Settings",
	// 		url: "#",
	// 		icon: IconSettings,
	// 	},
	// 	{
	// 		title: "Get Help",
	// 		url: "#",
	// 		icon: IconHelp,
	// 	},
	// 	{
	// 		title: "Search",
	// 		url: "#",
	// 		icon: IconSearch,
	// 	},
	// ]
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
				{/* <NavSecondary items={data.navSecondary} className="mt-auto" /> */}
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	);
}
