import { IconBriefcase, IconPlus, IconSettings } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { brandParams, orgParams } from "@workspace/lib/app-urls";
import { buttonVariants } from "@workspace/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { SiteIcon } from "@/components/site-icon";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { organizationTree } from "@/lib/organizations/tree";
import type { OrganizationSummary } from "@/lib/organizations/types";

const ROW = "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground";

/**
 * Shared by `/app` and the 404, which answer the same question.
 *
 * The same tree the account menu draws, so a person who has opened one has read
 * the other. Without the separators: nothing follows the last organization
 * here, so the space between them is enough to tell them apart.
 */
export function OrganizationDirectory({ organizations }: { organizations: OrganizationSummary[] }) {
	const features = useDeploymentFeatures();

	return (
		<div className="flex w-full min-w-[280px] flex-col gap-4">
			{organizations.map((organization) => (
				<OrganizationBlock key={organization.id} organization={organization} />
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

function OrganizationBlock({ organization }: { organization: OrganizationSummary }) {
	const { settingsLabel, children } = organizationTree(organization);

	return (
		<div>
			{/* The whole heading, not just the gear: it names the one thing it could
			    lead to, so anything less is a smaller target for no reason. */}
			<Tooltip>
				<TooltipTrigger
					render={
						<Link
							to="/app/org/$org/settings"
							params={orgParams(organization)}
							aria-label={settingsLabel}
							className={`${ROW} justify-between`}
						/>
					}
				>
					<span className="flex min-w-0 items-center gap-2">
						<IconBriefcase className="size-4 shrink-0 text-muted-foreground" />
						<span className="truncate font-medium">{organization.name}</span>
					</span>
					<IconSettings className="size-4 shrink-0 text-muted-foreground" />
				</TooltipTrigger>
				<TooltipContent>Organization Settings</TooltipContent>
			</Tooltip>

			{/* An organization with nothing in it and no way to add is its heading alone. */}
			{children.length > 0 && (
				<div className="ml-4 border-l pl-1">
					{children.map((child) =>
						child.kind === "brand" ? (
							<Link
								key={child.brand.id}
								to="/app/org/$org/brand/$brand"
								params={brandParams(organization, child.brand)}
								className={ROW}
							>
								<SiteIcon domain={child.brand.website} size="xs" />
								<span className="truncate">{child.brand.name}</span>
							</Link>
						) : (
							<Link
								key="new-brand"
								to="/app/org/$org/new"
								params={orgParams(organization)}
								className={`${ROW} text-muted-foreground`}
							>
								<IconPlus className="size-3.5" />
								{child.label}
							</Link>
						),
					)}
				</div>
			)}
		</div>
	);
}
