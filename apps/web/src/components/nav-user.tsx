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
import { useWorkspaces } from "@/hooks/use-workspaces";
import { resetCrispSession } from "@/lib/crisp";
import { resetPostHog } from "@/lib/posthog";
import { workspaceTitle } from "@/lib/workspaces/naming";
import type { WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * Who you are, and everything you can reach: each workspace, the brands inside
 * it, and the way to add either.
 *
 * One menu rather than two. A separate switcher above the nav said the same
 * things in different words, and the account it was switching for was in this
 * one — so a person had to learn both to know which workspace they were in and
 * how to leave it.
 *
 * The tick marks the brand, not the workspace: the workspace a brand belongs to
 * is already the heading it sits under, and ticking both said the same thing
 * twice.
 */
export function NavUser() {
	const { user } = useAuth();
	const { isMobile, setOpenMobile } = useSidebar();
	const branding = useBranding();
	const features = useDeploymentFeatures();
	const { workspaces, isLoading, isError, isFetching, refetch } = useWorkspaces();
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
								// Named, because what it opens is no longer just the account:
								// it is the way to every workspace and brand.
								aria-label="Account and workspaces"
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

						{workspaces.map((workspace) => (
							<WorkspaceSection key={workspace.id} workspace={workspace} brandParam={brandParam} onNavigate={close} />
						))}

						{isLoading && (
							<DropdownMenuItem disabled>
								<span className="text-muted-foreground">Loading workspaces…</span>
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
								{isFetching ? "Retrying…" : "Couldn't load your workspaces — retry"}
							</DropdownMenuItem>
						)}

						{features?.canCreateWorkspaces && (
							<>
								<DropdownMenuItem render={<Link to="/app/new" onClick={close} />} className="cursor-pointer">
									<IconPlus />
									New workspace
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
 * One workspace: what it is called, the way into its settings, and the brands
 * inside it.
 *
 * The heading carries the settings control rather than a separate row at the
 * bottom of the menu, because "settings" without a workspace beside it only
 * answers for whichever workspace you happen to be in.
 */
function WorkspaceSection({
	workspace,
	brandParam,
	onNavigate,
}: {
	workspace: WorkspaceSummary;
	brandParam: string | undefined;
	onNavigate: () => void;
}) {
	const title = workspaceTitle(workspace.name);

	return (
		<DropdownMenuGroup>
			<DropdownMenuLabel className="flex items-center justify-between gap-2 py-0 pr-0 text-muted-foreground">
				<span className="truncate">{title}</span>
				<Link
					to="/app/org/$org/settings"
					params={orgParams(workspace)}
					onClick={onNavigate}
					aria-label={`${title} settings`}
					className="rounded-sm p-1.5 hover:bg-accent hover:text-accent-foreground"
				>
					<IconSettings className="size-4" />
				</Link>
			</DropdownMenuLabel>

			{workspace.brands.map((brand) => (
				<DropdownMenuItem
					key={brand.id}
					render={<Link to="/app/org/$org/brand/$brand" params={brandParams(workspace, brand)} onClick={onNavigate} />}
					className="cursor-pointer"
				>
					<span className="truncate">{brand.name}</span>
					{brandSegment(brand) === brandParam && <IconCheck className="ml-auto size-3.5 shrink-0" />}
				</DropdownMenuItem>
			))}

			{/* Offered per workspace, because a plan's brand allowance is spent per
			    workspace: the same menu can create in one and not another. */}
			{workspace.canCreateBrand && (
				<DropdownMenuItem
					render={<Link to="/app/org/$org/new" params={orgParams(workspace)} onClick={onNavigate} />}
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
