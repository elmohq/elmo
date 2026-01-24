"use client";

import { IconDotsVertical, IconExternalLink, IconLogout, IconStatusChange } from "@tabler/icons-react";

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

import Link from "next/link";
import { clientConfig } from "@/lib/config/client";
import { Button } from "@workspace/ui/components/button";
import { useAuth } from "@/hooks/use-auth";

export function NavUserNoSidebar() {
	const { user, isLoading, loginUrl, logoutUrl } = useAuth();

	if (isLoading) {
		return (
			<div className="w-fit">
				<Button
					variant="ghost"
					size="lg"
					disabled
					className="w-full justify-start px-2 py-2 h-14 border border-muted-foreground/20"
				>
					<Avatar className="h-8 w-8 rounded-lg grayscale">
						<AvatarFallback className="rounded-lg">...</AvatarFallback>
					</Avatar>
					<div className="grid flex-1 text-left text-sm leading-tight ml-2">
						<span className="truncate font-medium">Loading...</span>
					</div>
				</Button>
			</div>
		);
	}

	if (!user) {
		// If no login URL (local/demo mode), don't show sign in
		if (!loginUrl) {
			return null;
		}
		return (
			<div className="w-fit">
				<Button
					variant="ghost"
					size="lg"
					asChild
					className="w-full justify-start px-2 py-2 h-14 border border-muted-foreground/20"
				>
					<a href={loginUrl}>
						<Avatar className="h-8 w-8 rounded-lg grayscale">
							<AvatarFallback className="rounded-lg">?</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight ml-2">
							<span className="truncate font-medium">Sign In</span>
						</div>
					</a>
				</Button>
			</div>
		);
	}

	return (
		<div className="w-fit">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="lg"
						className="w-full justify-start px-2 py-2 h-14 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground cursor-pointer border border-muted-foreground/20"
					>
						<Avatar className="h-8 w-8 rounded-lg grayscale">
							<AvatarImage src={user.picture} alt={user.name} />
							<AvatarFallback className="rounded-lg">
								{user.given_name?.[0]}
								{user.family_name?.[0]}
							</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight ml-2">
							<span className="truncate font-medium">{user.name}</span>
							<span className="text-muted-foreground truncate text-xs">{user.email}</span>
						</div>
						<IconDotsVertical className="ml-auto size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
					side="right"
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
								<span className="text-muted-foreground truncate text-xs">{user.email}</span>
							</div>
						</div>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem asChild className="cursor-pointer">
							<Link href="/app">
								<IconStatusChange />
								Switch Brand
							</Link>
						</DropdownMenuItem>
				{clientConfig.branding.parentUrl && clientConfig.branding.parentName && (
					<DropdownMenuItem asChild className="cursor-pointer">
						<Link href={clientConfig.branding.parentUrl!} target="_blank">
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
		</div>
	);
}
