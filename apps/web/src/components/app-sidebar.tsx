import {
	IconBuilding,
	IconBuildingSkyscraper,
	IconBuildings,
	IconChartBar,
	IconCpu,
	IconCreditCard,
	IconDashboard,
	IconLink,
	IconListDetails,
	IconReport,
	IconSitemap,
	IconSpeakerphone,
	IconTable,
	IconTarget,
	IconTimeline,
	IconTool,
	IconUsers,
} from "@tabler/icons-react";
import { Link, useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import type * as React from "react";
import { DemoModePill } from "@/components/demo-mode-pill";
import { Logo } from "@/components/logo";
import { NavAppInfo } from "@/components/nav-app-info";
import { type NavGroup, NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { WorkspaceWithBrands } from "@/lib/workspaces/types";

/**
 * How much of the app the shell around this page can reach:
 *  - "brand":     a brand's own pages, its workspace's settings, plus admin for
 *                 those who have it
 *  - "workspace": the workspace's own pages — its settings and a way back into
 *                 each of its brands (there is no brand in scope)
 *  - "admin":     the admin section only
 *  - "account":   nothing — the page is a gate the user has to clear first, so
 *                 the only things worth offering are who they are and how to leave
 */
export type SidebarScope = "brand" | "workspace" | "admin" | "account";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
	isAdmin?: boolean;
	hasReportAccess?: boolean;
	scope?: SidebarScope;
	/** Brand data from route loader — avoids a separate client-side fetch */
	brand?: BrandWithPrompts | null;
	/**
	 * The workspace this page belongs to, from the route loader. The rail names
	 * it and lists its brands from here, so neither waits on — nor can be emptied
	 * by — the switcher's all-workspaces query.
	 */
	workspace?: WorkspaceWithBrands | null;
}

export function AppSidebar({
	isAdmin = false,
	hasReportAccess = false,
	scope = "brand",
	brand,
	workspace,
	...props
}: AppSidebarProps) {
	const { setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = context.clientConfig?.features.reportGeneration ?? true;

	// A gate page offers no destinations: every link would either 404 or bounce
	// the user straight back to the gate.
	const showAdminSection = scope !== "account" && (isAdmin || (hasReportAccess && reportsEnabled));
	const inWorkspace = scope === "brand" || scope === "workspace";

	const groups: NavGroup[] = [];

	// Without a brand in scope, the brands themselves are the way back into the
	// dashboard the user came from.
	if (scope === "workspace" && workspace) {
		groups.push({
			label: "Brands",
			items: workspace.brands.map((b) => ({
				title: b.name,
				url: `/app/${workspace.slug}/${b.id}`,
				icon: IconDashboard,
				absolute: true,
			})),
		});
	}

	// Dashboard section - only show if we have a brand context
	if (scope === "brand") {
		const dashboardItems = [
			{
				title: "Overview",
				url: "/",
				icon: IconDashboard,
			},
		];

		// Only show Visibility and Citations if the brand is onboarded
		if (brand?.onboarded) {
			dashboardItems.push(
				{
					title: "Visibility",
					url: "/visibility",
					icon: IconChartBar,
				},
				{
					title: "Share of Voice",
					url: "/share-of-voice",
					icon: IconSpeakerphone,
				},
				{
					title: "Query Fan-Out",
					url: "/query-fan-out",
					icon: IconSitemap,
				},
				{
					title: "Citations",
					url: "/citations",
					icon: IconLink,
				},
				{
					title: "Opportunities",
					url: "/opportunities",
					icon: IconTarget,
				},
			);
		}

		groups.push({
			label: "Dashboard",
			items: dashboardItems,
		});

		// Settings section - only show if onboarded
		if (brand?.onboarded) {
			groups.push({
				label: "Brand settings",
				items: [
					{
						title: "Brand",
						url: "/settings/brand",
						icon: IconBuilding,
					},
					{
						title: "Competitors",
						url: "/settings/competitors",
						icon: IconBuildings,
					},
					{
						title: "Prompts",
						url: "/settings/prompts",
						icon: IconListDetails,
					},
					{
						title: "LLMs",
						url: "/settings/llms",
						icon: IconCpu,
					},
				],
			});
		}
	}

	// Workspace section — what the brand belongs to rather than what it is, so
	// its entries live apart from the brand's own and are labelled with the
	// workspace's name.
	if (inWorkspace) {
		groups.push({
			label: workspace ? `Workspace · ${workspace.name}` : "Workspace",
			items: [
				{ title: "General", url: "/settings", icon: IconBuildingSkyscraper, workspace: true },
				...(context.clientConfig?.features.teamInvites
					? [{ title: "Team", url: "/settings/members", icon: IconUsers, workspace: true }]
					: []),
				...(context.clientConfig?.features.billing
					? [{ title: "Billing", url: "/settings/billing", icon: IconCreditCard, workspace: true }]
					: []),
			],
		});
	}

	// Admin section
	if (showAdminSection) {
		const reportsItem = {
			title: "Reports",
			url: "/reports",
			icon: IconReport,
			absolute: true,
		};
		const adminItems = isAdmin
			? [
					{
						title: "Brands",
						url: "/admin",
						icon: IconTable,
						absolute: true,
					},
					...(reportsEnabled ? [reportsItem] : []),
					{
						title: "Workflows",
						url: "/admin/workflows",
						icon: IconTimeline,
						absolute: true,
					},
					{
						title: "Tools",
						url: "/admin/tools",
						icon: IconTool,
						absolute: true,
					},
				]
			: [reportsItem];

		groups.push({
			label: "Admin",
			items: adminItems,
		});
	}

	const brandmark = (
		<>
			<Logo iconClassName="!size-5" />
			<div className="ml-auto group-data-[collapsible=icon]:hidden">
				<DemoModePill />
			</div>
		</>
	);

	return (
		<Sidebar variant="inset" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						{/* On a gate page the mark still says whose product this is, but it
						    leads nowhere — /app would redirect right back here. */}
						{scope === "account" ? (
							<div className="flex items-center gap-2 p-2">{brandmark}</div>
						) : (
							<SidebarMenuButton asChild>
								<Link to="/app" onClick={() => setOpenMobile(false)}>
									{brandmark}
								</Link>
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
				</SidebarMenu>
				{inWorkspace && <WorkspaceSwitcher workspace={workspace} brandName={brand?.name} />}
			</SidebarHeader>
			<SidebarContent>
				<NavMain groups={groups} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser />
				<NavAppInfo />
			</SidebarFooter>
		</Sidebar>
	);
}
