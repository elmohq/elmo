import { IconPlus, IconSettings } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { SiteIcon } from "@/components/site-icon";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { organizationTitle } from "@/lib/organizations/naming";
import type { OrganizationSummary } from "@/lib/organizations/types";

/**
 * Shared by `/app` and the 404, which answer the same question.
 *
 * The organization name is a heading rather than a link: an organization isn't a page,
 * it's what brands and settings hang off, and both of those are their own
 * control here.
 */
export function OrganizationDirectory({ organizations }: { organizations: OrganizationSummary[] }) {
	const features = useDeploymentFeatures();

	return (
		<div className="flex min-w-[280px] flex-col gap-6">
			{organizations.map((organization) => (
				<OrganizationSection key={organization.id} organization={organization} />
			))}
			{features?.canCreateOrganizations && (
				<div className="space-y-3">
					<Separator />
					<Link to="/app/new" className={buttonVariants({ variant: "outline", className: "w-full" })}>
						<IconPlus />
						New organization
					</Link>
				</div>
			)}
		</div>
	);
}

function OrganizationSection({ organization }: { organization: OrganizationSummary }) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<span className="truncate font-medium">{organizationTitle(organization.name)}</span>
				<Link
					to="/app/org/$org/settings"
					params={orgParams(organization)}
					aria-label={`${organizationTitle(organization.name)} settings`}
					className={buttonVariants({ variant: "ghost", size: "icon" })}
				>
					<IconSettings />
				</Link>
			</div>

			<div className="flex flex-col space-y-2">
				{organization.brands.map((brand) => (
					<Link
						key={brand.id}
						to="/app/org/$org/brand/$brand"
						params={brandParams(organization, brand)}
						className={buttonVariants({ variant: "secondary" })}
					>
						<SiteIcon domain={brand.website} size="md" />
						{brand.name}
					</Link>
				))}

				{/* A plan's brand allowance is spent per organization, so the same page
				    can create in one and not another. */}
				{organization.canCreateBrand && (
					<Link
						to="/app/org/$org/new"
						params={orgParams(organization)}
						className={buttonVariants({ variant: "outline" })}
					>
						<IconPlus />
						{organization.brands.length > 0 ? "New brand" : "Create your first brand"}
					</Link>
				)}

				{organization.brands.length === 0 && !organization.canCreateBrand && (
					<p className="text-sm text-muted-foreground">No brands yet.</p>
				)}
			</div>
		</div>
	);
}
