/**
 * /app - Brand switcher page
 *
 * Lists every brand the user's organization(s) own. Most modes have exactly
 * one org, but whitelabel users can belong to several Auth0-synced orgs, so
 * this is a brand list scoped across all of the user's orgs, not a 1:1 org
 * list.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import FullPageCard from "@/components/full-page-card";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { inArray } from "drizzle-orm";

const getBrandSwitcherData = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		brands: { id: string; name: string }[];
		canCreateBrands: boolean;
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

		const orgs = await listUserOrganizations(session.user.id);
		const orgIds = orgs.map((o) => o.id);

		const scopedBrands =
			orgIds.length === 0
				? []
				: await db.query.brands.findMany({
						where: inArray(brands.organizationId, orgIds),
					});

		return {
			brands: scopedBrands.map((brand) => ({ id: brand.id, name: brand.name })),
			canCreateBrands: deployment.features.canCreateBrands,
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
	loader: async () => getBrandSwitcherData(),
	component: BrandSwitcherPage,
});

function BrandSwitcherPage() {
	const { brands: brandList, canCreateBrands } = Route.useLoaderData();

	return (
		<FullPageCard title="Brand Switcher" subtitle="Select a brand to get started">
			<div className="flex flex-col space-y-3 min-w-[200px]">
				{brandList.length > 0 ? (
					brandList.map((brand) => (
						<Button key={brand.id} asChild variant="secondary">
							<Link to="/app/$brand" params={{ brand: brand.id }}>
								{brand.name}
							</Link>
						</Button>
					))
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
