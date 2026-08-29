import {
	IconBriefcase,
	IconCheck,
	IconExternalLink,
	IconLogout,
	IconPlus,
	IconRefresh,
	IconSelector,
	IconSettings,
	IconUser,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { orgParams } from "@workspace/lib/app-urls";
import { authClient } from "@workspace/lib/auth/client";
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
import { OrganizationRowIcon } from "@/components/organization-row-icon";
import { useAuth } from "@/hooks/use-auth";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBranding, useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useOrganizations } from "@/hooks/use-organizations";
import { resetCrispSession } from "@/lib/crisp";
import { organizationTree } from "@/lib/organizations/tree";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { resetPostHog } from "@/lib/posthog";

/**
 * The tick marks the brand and not the organization: the organization is already the
 * heading the brand sits under.
 */
export function NavUser() {
	const { user } = useAuth();
	const { isMobile, setOpenMobile } = useSidebar();
	const branding = useBranding();
	const features = useDeploymentFeatures();
	const { organizations, isLoading, isError, isFetching, refetch } = useOrganizations();
	// The id, not the segment: brand slugs are unique within an organization, and
	// this menu lists several.
	const currentBrandId = useBrandId();

	// NavUser only renders inside _authed routes, which redirect to /auth/login
	// when there's no session — so `user` is always present at this point.
	if (!user) return null;

	const isNameEmailSame = user.name?.trim().toLowerCase() === user.email?.trim().toLowerCase();

	const parentDashboard =
		branding?.parentUrl && branding?.parentName ? { url: branding.parentUrl, name: branding.parentName } : null;
	const close = () => setOpenMobile(false);

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								aria-label="Account and organizations"
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

						{organizations.map((organization) => (
							<OrganizationSection
								key={organization.id}
								organization={organization}
								currentBrandId={currentBrandId}
								onNavigate={close}
							/>
						))}

						{isLoading && (
							<DropdownMenuItem disabled>
								<span className="text-muted-foreground">Loading organizations…</span>
							</DropdownMenuItem>
						)}
						{isError && (
							<DropdownMenuItem
								className="cursor-pointer"
								// Keep the menu open: the point of the item is to watch the retry
								// land, and closing would hide whatever it turns up.
								onSelect={(event) => {
									event.preventDefault();
									refetch();
								}}
							>
								<IconRefresh className={isFetching ? "animate-spin" : undefined} />
								{isFetching ? "Retrying…" : "Couldn't load your organizations — retry"}
							</DropdownMenuItem>
						)}

						{features?.canCreateOrganizations && (
							<>
								<DropdownMenuItem render={<Link to="/app/new" onClick={close} />} className="cursor-pointer">
									<IconPlus />
									New organization
								</DropdownMenuItem>
								<DropdownMenuSeparator />
							</>
						)}

						{parentDashboard && (
							<>
								<DropdownMenuGroup>
									<DropdownMenuItem
										render={<a href={parentDashboard.url} target="_blank" rel="noreferrer" />}
										className="cursor-pointer"
									>
										<IconExternalLink />
										{parentDashboard.name} Dashboard
									</DropdownMenuItem>
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

/**
 * The settings control sits on the heading rather than at the foot of the menu,
 * because "settings" with no organization beside it only answers for whichever
 * one you happen to be in.
 *
 * An organization with nothing under it renders nothing under it — no rule, no
 * empty-state line. The heading is the whole entry.
 */
function OrganizationSection({
	organization,
	currentBrandId,
	onNavigate,
}: {
	organization: OrganizationSummary;
	currentBrandId: string | undefined;
	onNavigate: () => void;
}) {
	const { settingsLabel, children } = organizationTree(organization);

	return (
		<DropdownMenuGroup aria-label={organization.name}>
			{/* The whole line, as in the directory: it names the one thing it could
			    lead to. A menu item rather than a bare link, because only items join
			    the menu's roving focus. */}
			<DropdownMenuItem
				render={<Link to="/app/org/$org/settings" params={orgParams(organization)} onClick={onNavigate} />}
				aria-label={settingsLabel}
				className="cursor-pointer font-medium"
			>
				<IconBriefcase className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate">{organization.name}</span>
				<span className="ml-auto flex w-7 shrink-0 justify-center">
					<IconSettings className="size-4 text-muted-foreground" />
				</span>
			</DropdownMenuItem>

			{/* The rule runs to the bottom of the last row's padding, so it ends
			    close to the separator and reads tighter than the open space above
			    the heading. The margin is measured from where the rule stops. */}
			{children.length > 0 && (
				<div className="mb-2 ml-4 border-l pl-1">
					{children.map((row) => (
						<DropdownMenuItem
							key={row.key}
							render={<Link {...row.link} onClick={onNavigate} />}
							className={row.kind === "brand" ? "cursor-pointer" : "cursor-pointer text-muted-foreground"}
						>
							<OrganizationRowIcon row={row} size="xs" />
							<span className="truncate">{row.label}</span>
							{row.kind === "brand" && row.id === currentBrandId && (
								<span className="ml-auto flex w-7 shrink-0 justify-center">
									<IconCheck className="size-3.5" />
								</span>
							)}
						</DropdownMenuItem>
					))}
				</div>
			)}

			<DropdownMenuSeparator />
		</DropdownMenuGroup>
	);
}
