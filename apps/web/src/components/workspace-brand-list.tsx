import { Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { SiteIcon } from "@/components/site-icon";
import type { WorkspaceWithBrands } from "@/lib/workspaces/types";

/**
 * The ways into a workspace: its brands, and one call to action beneath them.
 *
 * The picker, the workspace home, and the 404 all offer the same list, so they
 * offer it in the same words — three copies of this drifted apart on the labels
 * before it was one. The stacking is part of the list, not the caller's job.
 *
 * Creation is offered per workspace, because a plan's brand allowance is spent
 * per workspace: the same page can create in one and not another. A workspace
 * with neither brands nor the right to create one still gets a way in, which is
 * how an un-onboarded whitelabel workspace is reachable from the picker.
 */
export function WorkspaceBrandList({ workspace }: { workspace: WorkspaceWithBrands }) {
	const { brands, canCreateBrand } = workspace;

	return (
		<div className="flex flex-col space-y-2">
			{brands.map((brand) => (
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
			{canCreateBrand && (
				<Link
					to="/app/org/$org/new"
					params={orgParams(workspace)}
					className={buttonVariants({ variant: brands.length > 0 ? "outline" : "default" })}
				>
					{brands.length > 0 ? "New brand" : "Create your first brand"}
				</Link>
			)}
			{brands.length === 0 && !canCreateBrand && (
				<Link to="/app/org/$org" params={orgParams(workspace)} className={buttonVariants({ variant: "outline" })}>
					Set up {workspace.name}
				</Link>
			)}
		</div>
	);
}
