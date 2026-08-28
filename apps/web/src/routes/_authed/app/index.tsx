/**
 * Renders for everyone, one-organization deployments included: it is the only page
 * that lists what exists, so stepping aside would leave the mark that points
 * here landing on an organization's settings.
 */

import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { buildTitle, getAppName } from "@/lib/route-head";
import { listOrganizationsFn, type OrganizationSummary } from "@/server/organizations";

const getOrganizationPickerData = createServerFn({ method: "GET" }).handler(
	async (): Promise<OrganizationSummary[]> => {
		const deployment = getDeployment();

		if (deployment.mode === "whitelabel") {
			const session = await requireAuthSession();
			// Keep /app usable during Auth0 Management API incidents; background sync will reconcile memberships later.
			try {
				await syncAuth0UserById(session.user.id);
			} catch (error) {
				console.error("[auth0-sync] Failed to sync user on /app load; continuing with cached memberships", error);
			}
		}

		return listOrganizationsFn();
	},
);

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
	loader: (): Promise<OrganizationSummary[]> => getOrganizationPickerData(),
	head: ({ match }) => ({
		meta: [
			{ title: buildTitle("Organizations and Brands", { appName: getAppName(match) }) },
			{ name: "description", content: "Modify organizations or navigate to brands." },
		],
	}),
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
