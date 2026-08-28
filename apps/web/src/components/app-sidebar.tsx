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
import { brandParams, orgParams } from "@workspace/lib/app-urls";
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
import { type NavGroup, type NavItem, NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import type { WorkspaceSummary } from "@/lib/workspaces/types";

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

/**
 * Neither the workspace nor the brand is optional where the rail names one:
 * both come from the layouts that resolved them before any of this rendered.
 * Stating that as a union rather than nullable props is what keeps every entry
 * below from carrying a fallback for something that is always there.
 */
type ScopeProps =
	| { scope: "brand"; workspace: WorkspaceSummary; brand: BrandWithPrompts }
	| { scope: "workspace"; workspace: WorkspaceSummary }
	| { scope: "admin" | "account" };

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
	isAdmin?: boolean;
	hasReportAccess?: boolean;
} & ScopeProps;

function workspaceBrandsGroup(workspace: WorkspaceSummary): NavGroup {
	return {
		label: "Brands",
		items: workspace.brands.map((brand) => ({
			title: brand.name,
			link: { to: "/app/org/$org/brand/$brand", params: brandParams(workspace, brand) },
			icon: IconDashboard,
		})),
	};
}

/**
 * What the brand belongs to rather than what it is, so its entries live apart
 * from the brand's own and are labelled with the workspace's name.
 */
function workspaceGroup(workspace: WorkspaceSummary, features?: ClientConfig["features"]): NavGroup {
	const params = orgParams(workspace);
	const items: NavItem[] = [
		{ title: "General", link: { to: "/app/org/$org/settings", params }, icon: IconBuildingSkyscraper },
	];

	if (features?.teamInvites) {
		items.push({ title: "Team", link: { to: "/app/org/$org/settings/members", params }, icon: IconUsers });
	}
	if (features?.billing) {
		items.push({ title: "Billing", link: { to: "/app/org/$org/settings/billing", params }, icon: IconCreditCard });
	}

	return { label: `Workspace · ${workspace.name}`, items };
}

function brandGroups(workspace: WorkspaceSummary, brand: BrandWithPrompts): NavGroup[] {
	const params = brandParams(workspace, brand);
	const dashboard: NavItem[] = [
		{ title: "Overview", link: { to: "/app/org/$org/brand/$brand", params }, icon: IconDashboard },
	];

	// Everything but the overview reads results the brand doesn't have until it
	// has been through onboarding.
	if (brand.onboarded) {
		dashboard.push(
			{ title: "Visibility", link: { to: "/app/org/$org/brand/$brand/visibility", params }, icon: IconChartBar },
			{
				title: "Share of Voice",
				link: { to: "/app/org/$org/brand/$brand/share-of-voice", params },
				icon: IconSpeakerphone,
			},
			{ title: "Query Fan-Out", link: { to: "/app/org/$org/brand/$brand/query-fan-out", params }, icon: IconSitemap },
			{ title: "Citations", link: { to: "/app/org/$org/brand/$brand/citations", params }, icon: IconLink },
			{ title: "Opportunities", link: { to: "/app/org/$org/brand/$brand/opportunities", params }, icon: IconTarget },
		);
	}

	const groups: NavGroup[] = [{ label: "Dashboard", items: dashboard }];

	if (brand.onboarded) {
		groups.push({
			label: "Brand settings",
			items: [
				{ title: "Brand", link: { to: "/app/org/$org/brand/$brand/settings/brand", params }, icon: IconBuilding },
				{
					title: "Competitors",
					link: { to: "/app/org/$org/brand/$brand/settings/competitors", params },
					icon: IconBuildings,
				},
				{
					title: "Prompts",
					link: { to: "/app/org/$org/brand/$brand/settings/prompts", params },
					icon: IconListDetails,
				},
				{ title: "LLMs", link: { to: "/app/org/$org/brand/$brand/settings/llms", params }, icon: IconCpu },
			],
		});
	}

	return groups;
}

function adminGroup(isAdmin: boolean, reportsEnabled: boolean): NavGroup {
	const reportsItem: NavItem = { title: "Reports", link: { to: "/reports" }, icon: IconReport };
	if (!isAdmin) return { label: "Admin", items: [reportsItem] };

	return {
		label: "Admin",
		items: [
			{ title: "Brands", link: { to: "/admin" }, icon: IconTable },
			...(reportsEnabled ? [reportsItem] : []),
			{ title: "Workflows", link: { to: "/admin/workflows" }, icon: IconTimeline },
			{ title: "Tools", link: { to: "/admin/tools" }, icon: IconTool },
		],
	};
}

export function AppSidebar(props: AppSidebarProps) {
	const { isAdmin = false, hasReportAccess = false, scope, ...sidebarProps } = props;
	const { setOpenMobile } = useSidebar();
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	// Reports are disabled entirely in cloud; hide the nav entry there.
	const reportsEnabled = context.clientConfig?.features.reportGeneration ?? true;

	// Present exactly when the rail is inside a workspace, so it stands in for an
	// `inWorkspace` flag and carries the narrowing with it.
	const workspace = props.scope === "brand" || props.scope === "workspace" ? props.workspace : null;
	const brand = props.scope === "brand" ? props.brand : null;

	// A gate page offers no destinations: every link would either 404 or bounce
	// the user straight back to the gate.
	const showAdminSection = scope !== "account" && (isAdmin || (hasReportAccess && reportsEnabled));

	const groups: NavGroup[] = [
		// Without a brand in scope, the brands themselves are the way back into
		// the dashboard the user came from.
		...(props.scope === "workspace" ? [workspaceBrandsGroup(props.workspace)] : []),
		// Only a brand context has a dashboard; a gate page has no destinations.
		...(props.scope === "brand" ? brandGroups(props.workspace, props.brand) : []),
		...(workspace ? [workspaceGroup(workspace, context.clientConfig?.features)] : []),
		...(showAdminSection ? [adminGroup(isAdmin, reportsEnabled)] : []),
	];
	const brandmark = (
		<>
			<Logo iconClassName="!size-5" />
			<div className="ml-auto group-data-[collapsible=icon]:hidden">
				<DemoModePill />
			</div>
		</>
	);

	return (
		<Sidebar variant="inset" {...sidebarProps}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						{/* On a gate page the mark still says whose product this is, but it
						    leads nowhere — /app would redirect right back here. */}
						{scope === "account" ? (
							<div className="flex items-center gap-2 p-2">{brandmark}</div>
						) : (
							<SidebarMenuButton size="lg" render={<Link to="/app" onClick={() => setOpenMobile(false)} />}>
								{brandmark}
							</SidebarMenuButton>
						)}
					</SidebarMenuItem>
				</SidebarMenu>
				{workspace && <WorkspaceSwitcher workspace={workspace} brandName={brand?.name} />}
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
