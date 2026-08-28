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
 * Every workspace the user can reach and every brand inside it — the one place
 * that says what this account contains.
 *
 * Rendered by `/app` and by the 404, which needs to answer the same question.
 * The rail's user menu offers the same set in the same order, so a person who
 * learns one has learned the other.
 *
 * The workspace name is a heading, not a link: a workspace isn't a page you
 * visit, it's the thing brands and settings hang off, and the two things you
 * can actually do to it — open its settings, or go to one of its brands — are
 * each their own control.
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

				{/* Offered per workspace, because a plan's brand allowance is spent per
				    workspace: the same page can create in one and not another. */}
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
