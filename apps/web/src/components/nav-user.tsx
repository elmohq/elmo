"use client";

import {
	IconSelector,
	IconExternalLink,
	IconLogout,
	IconStatusChange,
} from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@workspace/ui/components/sidebar";

import Link from "next/link";
import { clientConfig } from "@/lib/config/client";
import { useAuth } from "@/hooks/use-auth";

export function NavUser() {
	const { user, isLoading, loginUrl, logoutUrl } = useAuth();
	const { isMobile, setOpenMobile } = useSidebar();
	const isNameEmailSame =
		user?.name?.trim().toLowerCase() === user?.email?.trim().toLowerCase();

	if (isLoading) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton size="lg" disabled>
						<Avatar className="h-8 w-8 rounded-lg grayscale">
							<AvatarFallback className="rounded-lg">...</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">Loading...</span>
						</div>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		);
	}

	if (!user) {
		// If no login URL (local/demo mode), don't show sign in
		if (!loginUrl) {
			return null;
		}
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton size="lg" asChild>
						<a href={loginUrl}>
							<Avatar className="h-8 w-8 rounded-lg grayscale">
								<AvatarFallback className="rounded-lg">?</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">Sign In</span>
							</div>
						</a>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		);
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer"
						>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarImage src={user.picture} alt={user.name} />
								<AvatarFallback className="rounded-lg">
									{user.given_name?.[0]}
									{user.family_name?.[0]}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{user.name}</span>
								<span className="truncate text-xs">{isNameEmailSame ? "Your Account" : user.email}</span>
							</div>
							<IconSelector className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuLabel className="p-0 font-normal">
							<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
								<Avatar className="h-8 w-8 rounded-lg">
									<AvatarImage src={user.picture} alt={user.name} />
									<AvatarFallback className="rounded-lg">
										{user.given_name?.[0]}
										{user.family_name?.[0]}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{user.name}</span>
									<span className="truncate text-xs">{isNameEmailSame ? "Your Account" : user.email}</span>
								</div>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem asChild className="cursor-pointer">
								<Link href="/app" onClick={() => setOpenMobile(false)}>
									<IconStatusChange />
									Switch Brand
								</Link>
							</DropdownMenuItem>
							{clientConfig.branding.parentUrl && clientConfig.branding.parentName && (
								<DropdownMenuItem asChild className="cursor-pointer">
									<Link href={clientConfig.branding.parentUrl} target="_blank">
										<IconExternalLink />
										{clientConfig.branding.parentName} Dashboard
									</Link>
								</DropdownMenuItem>
							)}
						</DropdownMenuGroup>
						{logoutUrl && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem asChild className="cursor-pointer">
									<a href={logoutUrl}>
										<IconLogout />
										Log out
									</a>
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
