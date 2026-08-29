/**
 * A page rather than a rail section, so brands sit beside the other things the
 * organization holds instead of forming a second nav tree beside the brand's own.
 */

import { IconPlus } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { SiteIcon } from "@/components/site-icon";
import { useOrganization } from "@/hooks/use-organizations";
import { organizationTree } from "@/lib/organizations/tree";
import { pageHead } from "@/lib/route-head";

export const Route = createFileRoute("/_authed/app/org/$org/settings/brands")({
	staticData: { crumb: "Brands" },
	head: pageHead({ description: "The brands this organization tracks." }),
	component: OrganizationBrandsPage,
});

function OrganizationBrandsPage() {
	const organization = useOrganization();
	const { children } = organizationTree(organization);

	return (
		<div className="max-w-2xl space-y-6">
			<h1 className="text-3xl font-bold">Brands</h1>

			<div className="flex flex-col gap-2">
				{organization.brands.length === 0 && <p className="text-sm text-muted-foreground">No brands yet.</p>}

				{children.map((child) => {
					if (child.kind === "brand") {
						return (
							<Link
								key={child.brand.id}
								to="/app/org/$org/brand/$brand"
								params={brandParams(organization, child.brand)}
								className={buttonVariants({ variant: "secondary", className: "justify-start" })}
							>
								<SiteIcon domain={child.brand.website} size="md" />
								{child.brand.name}
							</Link>
						);
					}
					return (
						<Link
							key={child.to}
							to={child.to}
							params={orgParams(organization)}
							className={buttonVariants({ variant: "outline", className: "justify-start" })}
						>
							<IconPlus />
							{child.label}
						</Link>
					);
				})}

				{/* Said where the button would have been, so its absence is explained. */}
				{organization.brandCreation.kind === "denied" && (
					<p className="text-sm text-muted-foreground">{organization.brandCreation.message}</p>
				)}
			</div>
		</div>
	);
}
