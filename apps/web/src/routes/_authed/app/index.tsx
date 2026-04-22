/**
 * /app - Brand switcher page
 *
 * In single-org mode (local/demo): redirects to the default org
 * In multi-org mode (whitelabel): shows brand switcher
 */

import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getDeployment } from "@/lib/config/server";
import { requireAuthSession, listUserOrganizations } from "@/lib/auth/helpers";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";


const getOrganizations = createServerFn({ method: "GET" }).handler(async (): Promise<{
	organizations: { id: string; name: string }[];
	supportsMultiOrg: boolean;
	defaultOrgId?: string;
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
		defaultOrgId: deployment.defaultOrganization?.id,
	};
});

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

		// Always show the switcher when the user has multiple brands, regardless of deployment flag.
		if (result.organizations.length >= 2) {
			return result;
		}

		// Single-org mode: redirect to default org
		if (!result.supportsMultiOrg && result.defaultOrgId) {
			throw redirect({ to: "/app/$brand", params: { brand: result.defaultOrgId } });
		}

		// Single-org mode with orgs but no default: redirect to first available
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
						<Button key={org.id} asChild variant="secondary" className="min-w-[200px]">
							<Link to="/app/$brand" params={{ brand: org.id }}>
								{org.name}
							</Link>
						</Button>
					))
				) : (
					<p className="text-muted-foreground text-center">No brands available</p>
				)}
			</div>
		</FullPageCard>
	);
}
