/**
 * A page rather than a rail section, so brands sit beside the other things the
 * workspace holds instead of forming a second nav tree beside the brand's own.
 */

import { IconPlus } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { SiteIcon } from "@/components/site-icon";
import { useWorkspaceRoute } from "@/hooks/use-workspaces";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/settings/brands")({
	staticData: { crumb: "Brands" },
	head: ({ match }) => ({
		meta: [
			{ title: buildTitle("Brands", { appName: getAppName(match) }) },
			{ name: "description", content: "The brands this workspace tracks." },
		],
	}),
	component: WorkspaceBrandsPage,
});

function WorkspaceBrandsPage() {
	const { workspace } = useWorkspaceRoute();

	return (
		<div className="max-w-2xl space-y-6">
			<h1 className="text-3xl font-bold">Brands</h1>

			<div className="flex flex-col gap-2">
				{workspace.brands.map((brand) => (
					<Link
						key={brand.id}
						to="/app/org/$org/brand/$brand"
						params={brandParams(workspace, brand)}
						className={buttonVariants({ variant: "secondary", className: "justify-start" })}
					>
						<SiteIcon domain={brand.website} size="md" />
						{brand.name}
					</Link>
				))}

				{workspace.brands.length === 0 && <p className="text-sm text-muted-foreground">No brands yet.</p>}

				{workspace.canCreateBrand && (
					<Link
						to="/app/org/$org/new"
						params={orgParams(workspace)}
						className={buttonVariants({ variant: "outline", className: "justify-start" })}
					>
						<IconPlus />
						{workspace.brands.length > 0 ? "New brand" : "Create your first brand"}
					</Link>
				)}

				{/* Said where the button would have been, so its absence is explained. */}
				{!workspace.canCreateBrand && workspace.brandLimit && (
					<p className="text-sm text-muted-foreground">{workspace.brandLimit.message}</p>
				)}
			</div>
		</div>
	);
}
