import { createFileRoute, Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { OrganizationRowIcon } from "@/components/organization-row-icon";
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

				{children.map((row) => (
					<Link
						key={row.key}
						{...row.link}
						className={buttonVariants({
							variant: row.kind === "brand" ? "secondary" : "outline",
							className: "justify-start",
						})}
					>
						<OrganizationRowIcon row={row} size="md" />
						{row.label}
					</Link>
				))}

				{organization.brandCreation.kind === "denied" && (
					<p className="text-sm text-muted-foreground">{organization.brandCreation.message}</p>
				)}
			</div>
		</div>
	);
}
