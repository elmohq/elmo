/**
 * /app - Brand switcher page
 *
 * In single-org mode (local/demo): redirects to the default org
 * In multi-org mode (whitelabel): shows brand switcher
 */

import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import FullPageCard from "@/components/full-page-card";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";

const getOrganizations = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		organizations: { id: string; name: string }[];
		supportsMultiOrg: boolean;
	}> => {
		const session = await requireAuthSession();
		const deployment = getDeployment();

		if (deployment.mode === "whitelabel") {
			// Keep /app usable during Auth0 Management API incidents; background sync will reconcile memberships later.
			try {
				await syncAuth0UserById(session.user.id);
			} catch (error) {
				console.error("[auth0-sync] Failed to sync user on /app load; continuing with cached memberships", error);
			}
		}

		const organizations = await listUserOrganizations(session.user.id);
		return {
			organizations,
			supportsMultiOrg: deployment.features.supportsMultiOrg,
		};
	},
);

function OrgSwitcherSkeleton() {
	return (
		<FullPageCard title="" subtitle="">
			<div className="flex flex-col space-y-3 min-w-[200px]">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-10 w-full" />
			</div>
		</FullPageCard>
	);
}

export const Route = createFileRoute("/_authed/app/")({
	pendingComponent: OrgSwitcherSkeleton,
	loader: async () => {
		const result = await getOrganizations();

		// Single-org mode: redirect to the user's one org (created on signup).
		if (!result.supportsMultiOrg && result.organizations.length > 0) {
			throw redirect({ to: "/app/$brand", params: { brand: result.organizations[0].id } });
		}

		return result;
	},
	component: BrandSwitcherPage,
});

function BrandSwitcherPage() {
	const { organizations } = Route.useLoaderData();

	return (
		<FullPageCard title="Brand Switcher" subtitle="Select a brand to get started">
			<div className="flex flex-col space-y-3">
				{organizations.length > 0 ? (
					organizations.map((org: { id: string; name: string }) => (
						<Button key={org.id} render={<Link to="/app/$brand" params={{ brand: org.id }} />} variant="secondary" className="min-w-[200px]">
							{org.name}
						</Button>
					))
				) : (
					<p className="text-muted-foreground text-center">No brands available</p>
				)}
			</div>
		</FullPageCard>
	);
}
