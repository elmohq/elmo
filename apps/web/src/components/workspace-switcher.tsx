import {
	IconBuildingSkyscraper,
	IconCheck,
	IconPlus,
	IconRefresh,
	IconSelector,
	IconSettings,
} from "@tabler/icons-react";
import { Link, useParams } from "@tanstack/react-router";
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
import type { WorkspaceWithBrands } from "@/lib/workspaces/types";

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
 * The workspace being viewed comes from the route loader, so its brands and its
 * settings are reachable whatever the all-workspaces query is doing; that query
 * only ever adds the workspaces this page isn't in.
 */
export function WorkspaceSwitcher({
	workspace,
	brandName: resolvedBrandName,
}: {
	workspace?: WorkspaceWithBrands | null;
	brandName?: string;
}) {
	const { isMobile, setOpenMobile } = useSidebar();
	const params = useParams({ strict: false }) as { org?: string; brand?: string };
	const { workspaces, isLoading, isError, isFetching, refetch } = useWorkspaces();

	const current = workspace ?? workspaces.find((w) => w.slug === params.org || w.id === params.org) ?? null;
	const others = workspaces.filter((w) => w.id !== current?.id);
	const listed = current ? [current, ...others] : others;

	const currentBrand = current?.brands.find((brand) => brand.id === params.brand);
	const workspaceName = current?.name ?? params.org ?? "";
	const brandName = resolvedBrandName ?? currentBrand?.name;
	const close = () => setOpenMobile(false);

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary">
								{workspaceName ? initials(workspaceName) : <IconBuildingSkyscraper className="size-4" />}
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate text-xs text-muted-foreground">{workspaceName}</span>
								<span className="truncate font-medium">{brandName ?? "All brands"}</span>
							</div>
							<IconSelector className="ml-auto size-4" />
						</SidebarMenuButton>
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
									{entry.id === current?.id && <IconCheck className="size-3.5 shrink-0" />}
								</DropdownMenuLabel>
								{entry.brands.map((brand) => (
									<DropdownMenuItem key={brand.id} asChild className="cursor-pointer">
										<Link to="/app/$org/$brand" params={{ org: entry.slug, brand: brand.id }} onClick={close}>
											<span className="truncate">{brand.name}</span>
											{brand.id === params.brand && entry.id === current?.id && (
												<IconCheck className="ml-auto size-3.5 shrink-0" />
											)}
										</Link>
									</DropdownMenuItem>
								))}
								{entry.brands.length === 0 && (
									<DropdownMenuItem asChild className="cursor-pointer">
										<Link to="/app/$org" params={{ org: entry.slug }} onClick={close}>
											<span className="text-muted-foreground">Set up this workspace</span>
										</Link>
									</DropdownMenuItem>
								)}
								{/* Offered per workspace, because a plan's brand allowance is spent
								    per workspace: the same menu can create in one and not another. */}
								{entry.canCreateBrand && (
									<DropdownMenuItem asChild className="cursor-pointer">
										<Link to="/app/$org/new" params={{ org: entry.slug }} onClick={close}>
											<IconPlus />
											New brand
										</Link>
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
						{current && (
							<DropdownMenuItem asChild className="cursor-pointer">
								<Link to="/app/$org/settings" params={{ org: current.slug }} onClick={close}>
									<IconSettings />
									Workspace settings
								</Link>
							</DropdownMenuItem>
						)}
						{listed.length > 1 && (
							<DropdownMenuItem asChild className="cursor-pointer">
								<Link to="/app" onClick={close}>
									<IconBuildingSkyscraper />
									All workspaces
								</Link>
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
