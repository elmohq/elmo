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
import { resetPostHog } from "@/lib/posthog";

export function NavUser() {
	const { user } = useAuth();
	const { isMobile, setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;

	// NavUser only renders inside _authed routes, which redirect to /auth/login
	// when there's no session — so `user` is always present at this point.
	if (!user) return null;

	const isNameEmailSame =
		user.name?.trim().toLowerCase() === user.email?.trim().toLowerCase();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground cursor-pointer"
							/>
						}
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
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuGroup>
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
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem render={<Link to="/app" onClick={() => setOpenMobile(false)} />} className="cursor-pointer">
								<IconStatusChange />
								Switch Brand
							</DropdownMenuItem>
							{clientConfig?.branding.parentUrl && clientConfig?.branding.parentName && (
								<DropdownMenuItem
									render={
										<a href={clientConfig.branding.parentUrl} target="_blank" rel="noreferrer">
											<IconExternalLink />
											{clientConfig.branding.parentName} Dashboard
										</a>
									}
									className="cursor-pointer"
								/>
							)}
						</DropdownMenuGroup>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							authClient.signOut({
								fetchOptions: {
									onSuccess: () => {
										resetPostHog();
										window.location.href = "/auth/logout";
									},
								},
							});
						}}
					>
						<IconLogout />
						Log out
					</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
