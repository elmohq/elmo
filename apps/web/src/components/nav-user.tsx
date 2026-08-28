import {
	IconCheck,
	IconExternalLink,
	IconLogout,
	IconPlus,
	IconRefresh,
	IconSelector,
	IconSettings,
	IconUser,
} from "@tabler/icons-react";
import { Link, useParams } from "@tanstack/react-router";
import { brandParams, brandSegment, orgParams } from "@workspace/lib/app-urls";
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
import { useAuth } from "@/hooks/use-auth";
import { useBranding, useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { useOrganizations } from "@/hooks/use-organizations";
import { resetCrispSession } from "@/lib/crisp";
import { organizationTitle } from "@/lib/organizations/naming";
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
	const brandParam = useParams({ strict: false, select: (params) => params.brand });

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
								brandParam={brandParam}
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
 * because "settings" with no organization beside it only answers for whichever one
 * you happen to be in.
 */
function OrganizationSection({
	organization,
	brandParam,
	onNavigate,
}: {
	organization: OrganizationSummary;
	brandParam: string | undefined;
	onNavigate: () => void;
}) {
	const title = organizationTitle(organization.name);

	return (
		<DropdownMenuGroup>
			<DropdownMenuLabel className="flex items-center justify-between gap-2 py-0 pr-0 text-muted-foreground">
				<span className="truncate">{title}</span>
				<Link
					to="/app/org/$org/settings"
					params={orgParams(organization)}
					onClick={onNavigate}
					aria-label={`${title} settings`}
					className="rounded-sm p-1.5 hover:bg-accent hover:text-accent-foreground"
				>
					<IconSettings className="size-4" />
				</Link>
			</DropdownMenuLabel>

			{organization.brands.map((brand) => (
				<DropdownMenuItem
					key={brand.id}
					render={
						<Link to="/app/org/$org/brand/$brand" params={brandParams(organization, brand)} onClick={onNavigate} />
					}
					className="cursor-pointer"
				>
					<span className="truncate">{brand.name}</span>
					{brandSegment(brand) === brandParam && <IconCheck className="ml-auto size-3.5 shrink-0" />}
				</DropdownMenuItem>
			))}

			{/* A plan's brand allowance is spent per organization, so the same menu can
			    create in one and not another. */}
			{organization.canCreateBrand && (
				<DropdownMenuItem
					render={<Link to="/app/org/$org/new" params={orgParams(organization)} onClick={onNavigate} />}
					className="cursor-pointer"
				>
					<IconPlus />
					New brand
				</DropdownMenuItem>
			)}

			<DropdownMenuSeparator />
		</DropdownMenuGroup>
	);
}
