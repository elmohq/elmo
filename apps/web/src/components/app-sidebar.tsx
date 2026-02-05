"use client";

import * as React from "react";
import Link from "next/link";
import {
	IconDashboard,
	// IconHelp,
	IconListDetails,
	// IconMessageReport,
	IconSettings,
	IconLink,
	IconShieldCog,
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
import { NavMain } from "@/components/nav-main";
// import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { Logo } from "@/components/logo";
import { clientConfig } from "@/lib/config/client";
import { useBrand } from "@/hooks/use-brands";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	isAdmin?: boolean;
}

export function AppSidebar({ isAdmin = false, ...props }: AppSidebarProps) {
	const { brand } = useBrand();
	const { setOpenMobile } = useSidebar();

	const showAdminLink = clientConfig.features.adminAccess && isAdmin;

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
						isActive: true,
					},
					{
						title: "Citations",
						url: "/citations",
						icon: IconLink,
					},
				]
			: []),
		{
			title: "Settings",
			url: "/settings",
			icon: IconSettings,
		},
		...(showAdminLink
			? [
					{
						title: "Admin",
						url: "/admin",
						icon: IconShieldCog,
						absolute: true,
					},
				]
			: []),
	];

	// const navSecondary = [
	// 	{
	// 		title: "Support",
	// 		url: "mailto:support@example.com",
	// 		icon: IconHelp,
	// 	},
	// 	{
	// 		title: "Feedback",
	// 		url: "mailto:feedback@example.com",
	// 		icon: IconMessageReport,
	// 	},
	// ];

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
				<NavMain items={navMain} />
				{/* <NavSecondary items={navSecondary} className="mt-auto" /> */}
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	);
}
