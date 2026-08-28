import { IconPlus, IconSettings } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { SiteIcon } from "@/components/site-icon";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { workspaceTitle } from "@/lib/workspaces/naming";
import type { WorkspaceSummary } from "@/lib/workspaces/types";

/**
 * Shared by `/app` and the 404, which answer the same question.
 *
 * The workspace name is a heading rather than a link: a workspace isn't a page,
 * it's what brands and settings hang off, and both of those are their own
 * control here.
 */
export function WorkspaceDirectory({ workspaces }: { workspaces: WorkspaceSummary[] }) {
	const features = useDeploymentFeatures();

	return (
		<div className="flex min-w-[280px] flex-col gap-6">
			{workspaces.map((workspace) => (
				<WorkspaceSection key={workspace.id} workspace={workspace} />
			))}
			{features?.canCreateWorkspaces && (
				<div className="space-y-3">
					<Separator />
					<Link to="/app/new" className={buttonVariants({ variant: "outline", className: "w-full" })}>
						<IconPlus />
						New workspace
					</Link>
				</div>
			)}
		</div>
	);
}

function WorkspaceSection({ workspace }: { workspace: WorkspaceSummary }) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<span className="truncate font-medium">{workspaceTitle(workspace.name)}</span>
				<Link
					to="/app/org/$org/settings"
					params={orgParams(workspace)}
					aria-label={`${workspaceTitle(workspace.name)} settings`}
					className={buttonVariants({ variant: "ghost", size: "icon" })}
				>
					<IconSettings />
				</Link>
			</div>

			<div className="flex flex-col space-y-2">
				{workspace.brands.map((brand) => (
					<Link
						key={brand.id}
						to="/app/org/$org/brand/$brand"
						params={brandParams(workspace, brand)}
						className={buttonVariants({ variant: "secondary" })}
					>
						<SiteIcon domain={brand.website} size="md" />
						{brand.name}
					</Link>
				))}

				{/* A plan's brand allowance is spent per workspace, so the same page
				    can create in one and not another. */}
				{workspace.canCreateBrand && (
					<Link to="/app/org/$org/new" params={orgParams(workspace)} className={buttonVariants({ variant: "outline" })}>
						<IconPlus />
						{workspace.brands.length > 0 ? "New brand" : "Create your first brand"}
					</Link>
				)}

				{workspace.brands.length === 0 && !workspace.canCreateBrand && (
					<p className="text-sm text-muted-foreground">No brands yet.</p>
				)}
			</div>
		</div>
	);
}
