import { IconChevronRight, IconPlus, IconSettings } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { SiteIcon } from "@/components/site-icon";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import type { OrganizationSummary } from "@/lib/organizations/types";

/**
 * Shared by `/app` and the 404, which answer the same question.
 *
 * A card per organization, so the two levels can't be read as one list. The
 * name is a heading rather than a link: an organization isn't a page, it's what
 * brands and settings hang off, and both of those are their own control here.
 */
export function OrganizationDirectory({ organizations }: { organizations: OrganizationSummary[] }) {
	const features = useDeploymentFeatures();

	return (
		<div className="flex w-full min-w-[320px] flex-col gap-4">
			{organizations.map((organization) => (
				<OrganizationCard key={organization.id} organization={organization} />
			))}
			{features?.canCreateOrganizations && (
				<Link to="/app/new" className={buttonVariants({ variant: "outline", className: "w-full gap-1.5" })}>
					<IconPlus className="size-4" />
					New organization
				</Link>
			)}
		</div>
	);
}

function OrganizationCard({ organization }: { organization: OrganizationSummary }) {
	const hasRows = organization.brands.length > 0 || organization.canCreateBrand;

	return (
		<div className="overflow-hidden rounded-xl border bg-background">
			{/* The whole header, not just the gear: the header names the one thing it
			    could lead to, so anything less is a smaller target for no reason. */}
			<Tooltip>
				<TooltipTrigger
					render={
						<Link
							to="/app/org/$org/settings"
							params={orgParams(organization)}
							aria-label={`${organization.name} settings`}
							className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3 hover:bg-muted/60"
						/>
					}
				>
					<span className="min-w-0 flex-1 truncate font-medium">{organization.name}</span>
					<span className="flex w-9 shrink-0 justify-center">
						<IconSettings className="size-4 text-muted-foreground" />
					</span>
				</TooltipTrigger>
				<TooltipContent>Organization settings</TooltipContent>
			</Tooltip>

			{/* An organization with nothing in it and no way to add is its header alone. */}
			{hasRows && (
				<div className="divide-y">
					{organization.brands.map((brand) => (
						<Link
							key={brand.id}
							to="/app/org/$org/brand/$brand"
							params={brandParams(organization, brand)}
							className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-accent/50"
						>
							<SiteIcon domain={brand.website} size="sm" />
							<span className="flex-1 truncate">{brand.name}</span>
							{/* The same box the header's settings control occupies, so the two
							    sit on one line down the card's right edge. */}
							<span className="flex w-9 shrink-0 justify-center">
								<IconChevronRight className="size-4 text-muted-foreground/60" />
							</span>
						</Link>
					))}

					{/* A plan's brand allowance is spent per organization, so the same page
					    can create in one and not another. */}
					{organization.canCreateBrand && (
						<Link
							to="/app/org/$org/new"
							params={orgParams(organization)}
							className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent/50"
						>
							<IconPlus className="size-4" />
							{organization.brands.length > 0 ? "New brand" : "Create your first brand"}
						</Link>
					)}
				</div>
			)}
		</div>
	);
}
