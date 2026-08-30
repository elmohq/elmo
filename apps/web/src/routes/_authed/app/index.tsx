/**
 * Renders for everyone, one-organization deployments included: it is the only
 * page that lists what exists, so stepping aside would leave the mark that
 * points here landing on an organization's settings.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { invalidateOrganizations, organizationsQuery } from "@/lib/organizations/queries";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { pageHead } from "@/lib/route-head";
import { syncOrganizationMembershipsFn } from "@/server/organizations";

function OrganizationPickerSkeleton() {
	return (
		<FullPageCard title="" subtitle="">
			<div className="flex min-w-[200px] flex-col space-y-3">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		</FullPageCard>
	);
}

export const Route = createFileRoute("/_authed/app/")({
	pendingComponent: OrganizationPickerSkeleton,
	// The same cache the account menu reads, so a mutation invalidates what this
	// page shows.
	loader: async ({ context }): Promise<OrganizationSummary[]> => {
		// Only whitelabel keeps memberships anywhere else, and asking elsewhere is
		// a round trip that returns false in front of this page's only real read.
		if (context.clientConfig?.mode === "whitelabel" && (await syncOrganizationMembershipsFn())) {
			await invalidateOrganizations(context.queryClient);
		}
		return (await context.queryClient.ensureQueryData(organizationsQuery)) ?? [];
	},
	head: pageHead({ title: "Organizations and Brands", description: "Modify organizations or navigate to brands." }),
	component: OrganizationPickerPage,
});

function OrganizationPickerPage() {
	const organizations = Route.useLoaderData();

	if (organizations.length === 0) {
		return (
			<FullPageCard title="No organizations" subtitle="Your account isn't a member of an organization yet.">
				<p className="text-center text-muted-foreground">Ask an admin to invite you, then reload this page.</p>
			</FullPageCard>
		);
	}

	return (
		<FullPageCard title="Organizations and Brands" subtitle="Modify organizations or navigate to brands.">
			<OrganizationDirectory organizations={organizations} />
		</FullPageCard>
	);
}
