import {
	IconBuildingSkyscraper,
	IconCheck,
	IconPlus,
	IconRefresh,
	IconSelector,
	IconSettings,
} from "@tabler/icons-react";
import { Link, useParams } from "@tanstack/react-router";
import { brandParams, brandSegment, orgParams } from "@workspace/lib/app-urls";
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
import { useWorkspaces } from "@/hooks/use-workspaces";
import type { WorkspaceSummary, WorkspaceWithBrands } from "@/lib/workspaces/types";

/** Two letters is enough to tell workspaces apart at a glance in the rail. */
function initials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/**
 * Which workspace you're in, and which brand inside it — stated in the rail
 * rather than left to be inferred from the URL, and the way to switch either.
 *
 * The brand line is the page's own subject; the workspace above it is what
 * decides who can see that page and who is billed for it, which is exactly the
 * thing a user with more than one workspace has to keep straight.
 *
 * The workspace being viewed comes from the route layout, so its name, its
 * brands and its settings are on screen from the first paint and cannot be
 * emptied by a failing query. The all-workspaces query adds the workspaces this
 * page isn't in, and the one thing the layout deliberately doesn't carry:
 * whether a workspace can take another brand, which costs an entitlements read.
 * "New brand" therefore appears with the query rather than before it.
 */
export function WorkspaceSwitcher({
	workspace,
	brandName: resolvedBrandName,
}: {
	workspace: WorkspaceSummary;
	brandName?: string;
}) {
	const { isMobile, setOpenMobile } = useSidebar();
	const brandParam = useParams({ strict: false, select: (params) => params.brand });
	const { workspaces, isLoading, isError, isFetching, refetch } = useWorkspaces();

	// The query's copy of this workspace, when it has arrived, is the same
	// workspace with the creation answer attached.
	const fromQuery = workspaces.find((w) => w.id === workspace.id);
	const current: WorkspaceWithBrands = fromQuery ?? { ...workspace, canCreateBrand: false };
	const listed = [current, ...workspaces.filter((w) => w.id !== workspace.id)];

	const currentBrand = current.brands.find((brand) => brandSegment(brand) === brandParam);
	const brandName = resolvedBrandName ?? currentBrand?.name;
	const close = () => setOpenMobile(false);

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								className="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							/>
						}
					>
						<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
							{initials(current.name)}
						</div>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate text-xs text-muted-foreground">{current.name}</span>
							<span className="truncate font-medium">{brandName ?? "All brands"}</span>
						</div>
						<IconSelector className="ml-auto size-4" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="max-h-[70svh] w-(--radix-dropdown-menu-trigger-width) min-w-64 overflow-y-auto rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="start"
						sideOffset={4}
					>
						{listed.map((entry) => (
							<DropdownMenuGroup key={entry.id}>
								<DropdownMenuLabel className="flex items-center justify-between gap-2 text-muted-foreground">
									<span className="truncate">{entry.name}</span>
									{entry.id === current.id && <IconCheck className="size-3.5 shrink-0" />}
								</DropdownMenuLabel>
								{entry.brands.map((brand) => (
									<DropdownMenuItem
										key={brand.id}
										render={<Link to="/app/org/$org/brand/$brand" params={brandParams(entry, brand)} onClick={close} />}
										className="cursor-pointer"
									>
										<span className="truncate">{brand.name}</span>
										{brandSegment(brand) === brandParam && entry.id === current.id && (
											<IconCheck className="ml-auto size-3.5 shrink-0" />
										)}
									</DropdownMenuItem>
								))}
								{entry.brands.length === 0 && (
									<DropdownMenuItem
										render={<Link to="/app/org/$org" params={orgParams(entry)} onClick={close} />}
										className="cursor-pointer"
									>
										<span className="text-muted-foreground">Set up this workspace</span>
									</DropdownMenuItem>
								)}
								{/* Offered per workspace, because a plan's brand allowance is spent
								    per workspace: the same menu can create in one and not another. */}
								{entry.canCreateBrand && (
									<DropdownMenuItem
										render={<Link to="/app/org/$org/new" params={orgParams(entry)} onClick={close} />}
										className="cursor-pointer"
									>
										<IconPlus />
										New brand
									</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
							</DropdownMenuGroup>
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
								{isFetching ? "Retrying…" : "Couldn't load your other workspaces — retry"}
							</DropdownMenuItem>
						)}
						<DropdownMenuItem
							render={<Link to="/app/org/$org/settings" params={orgParams(current)} onClick={close} />}
							className="cursor-pointer"
						>
							<IconSettings />
							Workspace settings
						</DropdownMenuItem>
						{listed.length > 1 && (
							<DropdownMenuItem render={<Link to="/app" onClick={close} />} className="cursor-pointer">
								<IconBuildingSkyscraper />
								All workspaces
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
