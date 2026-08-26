import { IconSelector, IconExternalLink, IconLogout, IconStatusChange, IconUser } from "@tabler/icons-react";

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
import { resetCrispSession } from "@/lib/crisp";

/** `canSwitchBrand` is false on gate pages, where /app just redirects back. */
export function NavUser({ canSwitchBrand = true }: { canSwitchBrand?: boolean } = {}) {
	const { user } = useAuth();
	const { isMobile, setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const clientConfig = context.clientConfig;

	// NavUser only renders inside _authed routes, which redirect to /auth/login
	// when there's no session — so `user` is always present at this point.
	if (!user) return null;

	const isNameEmailSame = user.name?.trim().toLowerCase() === user.email?.trim().toLowerCase();

	const branding = clientConfig?.branding;
	const parentDashboard =
		branding?.parentUrl && branding?.parentName ? { url: branding.parentUrl, name: branding.parentName } : null;
	const hasDestinations = canSwitchBrand || parentDashboard !== null;

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
						className="w-(--anchor-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						{/* Base UI wires the label to its group, so it has to sit inside one. */}
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
						{/* The group and the rule under it come and go together: a
						    deployment with no parent dashboard, on a page that cannot
						    switch brand, would otherwise draw two rules with nothing
						    between them. */}
						{hasDestinations && (
							<>
								<DropdownMenuGroup>
									{canSwitchBrand && (
										<DropdownMenuItem
											render={<Link to="/app" onClick={() => setOpenMobile(false)} />}
											className="cursor-pointer"
										>
											<IconStatusChange />
											Switch Brand
										</DropdownMenuItem>
									)}
									{parentDashboard && (
										<DropdownMenuItem
											render={<a href={parentDashboard.url} target="_blank" rel="noreferrer" />}
											className="cursor-pointer"
										>
											<IconExternalLink />
											{parentDashboard.name} Dashboard
										</DropdownMenuItem>
									)}
								</DropdownMenuGroup>
								<DropdownMenuSeparator />
							</>
						)}
						<DropdownMenuItem
							className="cursor-pointer"
							onClick={() => {
								authClient.signOut({
									fetchOptions: {
										onSuccess: () => {
											resetPostHog();
											resetCrispSession();
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
