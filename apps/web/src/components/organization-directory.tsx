import { IconBriefcase, IconPlus, IconSettings } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { OrganizationRowIcon } from "@/components/organization-row-icon";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { organizationTree } from "@/lib/organizations/tree";
import type { OrganizationSummary } from "@/lib/organizations/types";

const ROW = "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground";

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
	const { heading, children } = organizationTree(organization);

	return (
		<div>
			<Tooltip>
				<TooltipTrigger
					render={<Link {...heading.link} aria-label={heading.ariaLabel} className={`${ROW} justify-between`} />}
				>
					<span className="flex min-w-0 items-center gap-2">
						<IconBriefcase className="size-4 shrink-0 text-muted-foreground" />
						<span className="truncate font-medium">{heading.label}</span>
					</span>
					<IconSettings className="size-4 shrink-0 text-muted-foreground" />
				</TooltipTrigger>
				<TooltipContent>Organization Settings</TooltipContent>
			</Tooltip>

			{children.length > 0 && (
				<div className="ml-4 border-l pl-1">
					{children.map((row) => (
						<Link key={row.key} {...row.link} className={row.kind === "brand" ? ROW : `${ROW} text-muted-foreground`}>
							<OrganizationRowIcon row={row} size="xs" />
							<span className="truncate">{row.label}</span>
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
