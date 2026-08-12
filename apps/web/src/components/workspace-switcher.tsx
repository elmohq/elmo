import { IconBuildingSkyscraper, IconCheck, IconPlus, IconSelector, IconSettings } from "@tabler/icons-react";
import { Link, useParams } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { useRouteContext } from "@tanstack/react-router";
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
 */
export function WorkspaceSwitcher({
	workspaceName: resolvedName,
	brandName: resolvedBrandName,
}: {
	workspaceName?: string;
	brandName?: string;
}) {
	const { isMobile, setOpenMobile } = useSidebar();
	const params = useParams({ strict: false }) as { org?: string; brand?: string };
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const canCreateBrands = context.clientConfig?.features.canCreateBrands ?? false;
	const { workspaces } = useWorkspaces();

	const current = workspaces.find((workspace) => workspace.slug === params.org || workspace.id === params.org);
	const currentBrand = current?.brands.find((brand) => brand.id === params.brand);

	// The route hands down the names it already resolved, so the rail never
	// paints a raw slug — or the wrong brand — while the list is still in flight.
	const workspaceName = resolvedName ?? current?.name ?? params.org ?? "";
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
						{workspaces.map((workspace) => (
							<DropdownMenuGroup key={workspace.id}>
								<DropdownMenuLabel className="flex items-center justify-between gap-2 text-muted-foreground">
									<span className="truncate">{workspace.name}</span>
									{workspace.id === current?.id && <IconCheck className="size-3.5 shrink-0" />}
								</DropdownMenuLabel>
								{workspace.brands.map((brand) => (
									<DropdownMenuItem key={brand.id} asChild className="cursor-pointer">
										<Link to="/app/$org/$brand" params={{ org: workspace.slug, brand: brand.id }} onClick={close}>
											<span className="truncate">{brand.name}</span>
											{brand.id === params.brand && workspace.id === current?.id && (
												<IconCheck className="ml-auto size-3.5 shrink-0" />
											)}
										</Link>
									</DropdownMenuItem>
								))}
								{workspace.brands.length === 0 && (
									<DropdownMenuItem asChild className="cursor-pointer">
										<Link to="/app/$org" params={{ org: workspace.slug }} onClick={close}>
											<span className="text-muted-foreground">Set up this workspace</span>
										</Link>
									</DropdownMenuItem>
								)}
								{canCreateBrands && (
									<DropdownMenuItem asChild className="cursor-pointer">
										<Link to="/app/$org/new" params={{ org: workspace.slug }} onClick={close}>
											<IconPlus />
											New brand
										</Link>
									</DropdownMenuItem>
								)}
								<DropdownMenuSeparator />
							</DropdownMenuGroup>
						))}
						{current && (
							<DropdownMenuItem asChild className="cursor-pointer">
								<Link to="/app/$org/settings" params={{ org: current.slug }} onClick={close}>
									<IconSettings />
									Workspace settings
								</Link>
							</DropdownMenuItem>
						)}
						{workspaces.length > 1 && (
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
