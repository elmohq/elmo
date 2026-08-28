/**
 * A page rather than a rail section, so brands sit beside the other things the
 * organization holds instead of forming a second nav tree beside the brand's own.
 */

import { IconPlus } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { SiteIcon } from "@/components/site-icon";
import { useOrganizationRoute } from "@/hooks/use-organizations";
import { buildTitle, getAppName } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/settings/brands")({
	staticData: { crumb: "Brands" },
	head: ({ match }) => ({
		meta: [
			{ title: buildTitle("Brands", { appName: getAppName(match) }) },
			{ name: "description", content: "The brands this organization tracks." },
		],
	}),
	component: OrganizationBrandsPage,
});

function OrganizationBrandsPage() {
	const { organization } = useOrganizationRoute();

	return (
		<div className="max-w-2xl space-y-6">
			<h1 className="text-3xl font-bold">Brands</h1>

			<div className="flex flex-col gap-2">
				{organization.brands.map((brand) => (
					<Link
						key={brand.id}
						to="/app/org/$org/brand/$brand"
						params={brandParams(organization, brand)}
						className={buttonVariants({ variant: "secondary", className: "justify-start" })}
					>
						<SiteIcon domain={brand.website} size="md" />
						{brand.name}
					</Link>
				))}

				{organization.brands.length === 0 && <p className="text-sm text-muted-foreground">No brands yet.</p>}

				{organization.canCreateBrand && (
					<Link
						to="/app/org/$org/new"
						params={orgParams(organization)}
						className={buttonVariants({ variant: "outline", className: "justify-start" })}
					>
						<IconPlus />
						{organization.brands.length > 0 ? "New brand" : "Create your first brand"}
					</Link>
				)}

				{/* Said where the button would have been, so its absence is explained. */}
				{!organization.canCreateBrand && organization.brandLimit && (
					<p className="text-sm text-muted-foreground">{organization.brandLimit.message}</p>
				)}
			</div>
		</div>
	);
}
