import { Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { Button } from "@workspace/ui/components/button";
import type { WorkspaceWithBrands } from "@/lib/workspaces/types";

/**
 * The ways into a workspace: its brands, and one call to action beneath them.
 *
 * The picker, the workspace home, and the 404 all offer the same list, so they
 * offer it in the same words — three copies of this drifted apart on the labels
 * before it was one.
 *
 * Creation is offered per workspace, because a plan's brand allowance is spent
 * per workspace: the same page can create in one and not another. A workspace
 * with neither brands nor the right to create one still gets a way in, which is
 * how an un-onboarded whitelabel workspace is reachable from the picker.
 */
export function WorkspaceBrandList({ workspace }: { workspace: WorkspaceWithBrands }) {
	const { brands, canCreateBrand } = workspace;

	return (
		<>
			{brands.map((brand) => (
				<Button key={brand.id} asChild variant="secondary">
					<Link to="/app/org/$org/brand/$brand" params={brandParams(workspace, brand)}>
						{brand.name}
					</Link>
				</Button>
			))}
			{canCreateBrand && (
				<Button asChild variant={brands.length > 0 ? "outline" : "default"}>
					<Link to="/app/org/$org/new" params={orgParams(workspace)}>
						{brands.length > 0 ? "New brand" : "Create your first brand"}
					</Link>
				</Button>
			)}
			{brands.length === 0 && !canCreateBrand && (
				<Button asChild variant="outline">
					<Link to="/app/org/$org" params={orgParams(workspace)}>
						Set up {workspace.name}
					</Link>
				</Button>
			)}
		</>
	);
}
