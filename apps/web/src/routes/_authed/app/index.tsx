/**
 * /app - Brand switcher page
 *
 * Lists brands across every organization the user belongs to. Organizations
 * without a brand are retained only for the white-label onboarding path.
 */

import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import { inArray } from "drizzle-orm";
import FullPageCard from "@/components/full-page-card";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";

const getBrandSwitcherData = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		brands: { id: string; name: string }[];
		unprovisionedOrganizations: { id: string; name: string }[];
		canCreateBrands: boolean;
		cloudOnboardingOrganizationId: string | null;
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
		const organizationIds = organizations.map((organization) => organization.id);
		const scopedBrands =
			organizationIds.length === 0
				? []
				: await db
						.select({ id: brands.id, name: brands.name, organizationId: brands.organizationId })
						.from(brands)
						.where(inArray(brands.organizationId, organizationIds));
		const provisionedOrganizationIds = new Set(scopedBrands.map((brand) => brand.organizationId));

		return {
			brands: scopedBrands.map((brand) => ({ id: brand.id, name: brand.name })),
			unprovisionedOrganizations: deployment.features.canCreateBrands
				? []
				: organizations.filter((organization) => !provisionedOrganizationIds.has(organization.id)),
			canCreateBrands: deployment.features.canCreateBrands,
			cloudOnboardingOrganizationId:
				deployment.mode === "cloud" && scopedBrands.length === 0 && organizations.length === 1
					? (organizations[0]?.id ?? null)
					: null,
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
		const data = await getBrandSwitcherData();
		if (data.cloudOnboardingOrganizationId) {
			throw redirect({
				to: "/app/new",
				search: { organization: data.cloudOnboardingOrganizationId },
			});
		}
		return data;
	},
	component: BrandSwitcherPage,
});

function BrandSwitcherPage() {
	const { brands: brandList, unprovisionedOrganizations, canCreateBrands } = Route.useLoaderData();

	return (
		<FullPageCard title="Brand Switcher" subtitle="Select a brand to get started">
			<div className="flex flex-col space-y-3 min-w-[200px]">
				{brandList.length > 0 || unprovisionedOrganizations.length > 0 ? (
					<>
						{brandList.map((brand) => (
							<Button key={brand.id} asChild variant="secondary">
								<Link to="/app/$brand" params={{ brand: brand.id }}>
									{brand.name}
								</Link>
							</Button>
						))}
						{unprovisionedOrganizations.map((organization) => (
							<Button key={organization.id} asChild variant="outline">
								<Link to="/app/$brand" params={{ brand: organization.id }}>
									Set up {organization.name}
								</Link>
							</Button>
						))}
					</>
				) : (
					<p className="text-muted-foreground text-center">No brands available</p>
				)}
				{canCreateBrands && (
					<Button asChild variant="outline">
						<Link to="/app/new">+ Create new brand</Link>
					</Button>
				)}
			</div>
		</FullPageCard>
	);
}
