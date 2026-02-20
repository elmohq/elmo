import {
	IconSelector,
	IconExternalLink,
	IconLogout,
	IconStatusChange,
	IconUser,
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

import { Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { authClient } from "@workspace/lib/auth/client";
import { useAuth } from "@/hooks/use-auth";
import { NavAppInfo } from "@/components/nav-app-info";

export function NavUser() {
	const { user, isLoading, loginUrl, logoutUrl } = useAuth();
	const { isMobile, setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;
	const isNameEmailSame =
		user?.name?.trim().toLowerCase() === user?.email?.trim().toLowerCase();

	// In local/demo mode, there's no auth system — show app info instead
	if (!loginUrl && !logoutUrl) {
		return <NavAppInfo />;
	}

	if (isLoading) {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton size="lg" disabled>
						<Avatar className="h-8 w-8 rounded-lg grayscale">
							<AvatarFallback className="rounded-lg bg-muted text-muted-foreground">
								<IconUser className="size-4" />
							</AvatarFallback>
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
		// If no login URL (local/demo mode), show app info instead
		if (!loginUrl) {
			return <NavAppInfo />;
		}
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton size="lg" asChild>
						<a href={loginUrl}>
							<Avatar className="h-8 w-8 rounded-lg">
								<AvatarFallback className="rounded-lg bg-primary/10 text-primary">
									<IconUser className="size-4" />
								</AvatarFallback>
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
								<AvatarFallback className="rounded-lg bg-primary/10 text-primary">
									<IconUser className="size-4" />
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
								<AvatarFallback className="rounded-lg bg-primary/10 text-primary">
									<IconUser className="size-4" />
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
								<Link to="/app" onClick={() => setOpenMobile(false)}>
									<IconStatusChange />
									Switch Brand
								</Link>
							</DropdownMenuItem>
							{clientConfig?.branding.parentUrl && clientConfig?.branding.parentName && (
								<DropdownMenuItem asChild className="cursor-pointer">
									<a href={clientConfig.branding.parentUrl} target="_blank" rel="noreferrer">
										<IconExternalLink />
										{clientConfig.branding.parentName} Dashboard
									</a>
								</DropdownMenuItem>
							)}
						</DropdownMenuGroup>
					{logoutUrl && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="cursor-pointer"
								onClick={() => {
									authClient.signOut({
										fetchOptions: {
											onSuccess: () => {
												window.location.href = "/auth/logout";
											},
										},
									});
								}}
							>
								<IconLogout />
								Log out
							</DropdownMenuItem>
						</>
					)}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
