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
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { buttonVariants } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { syncAuth0UserById } from "@workspace/whitelabel/auth-hooks";
import { inArray } from "drizzle-orm";
import { BrandLogo } from "@/components/brand-logo";
import FullPageCard from "@/components/full-page-card";
import { listUserOrganizations, requireAuthSession } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";

const getBrandSwitcherData = createServerFn({ method: "GET" }).handler(
	async (): Promise<{
		brands: { id: string; name: string; website: string }[];
		unprovisionedOrgs: { id: string; name: string }[];
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
				: await db
						.select({
							id: brands.id,
							name: brands.name,
							website: brands.website,
							organizationId: brands.organizationId,
						})
						.from(brands)
						.where(inArray(brands.organizationId, orgIds));

		// An org with no brand row yet is only reachable through the legacy
		// `/app/$orgId` onboarding wizard. Modes that can create brands from the
		// UI use that flow instead, so surfacing the org there would offer two
		// paths to the same thing.
		const canCreateBrands = deployment.features.canCreateBrands;
		const provisioned = new Set(scopedBrands.map((b) => b.organizationId));

		return {
			// Alphabetical, with the id breaking ties between brands that share a
			// name: an unordered select leaves the order up to Postgres, which is
			// free to hand back a different one after any row rewrite or plan
			// change. Sorted here rather than in SQL so the result doesn't depend
			// on the deployment's database collation.
			brands: scopedBrands
				.map((brand) => ({ id: brand.id, name: brand.name, website: brand.website }))
				.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
			unprovisionedOrgs: canCreateBrands ? [] : orgs.filter((o) => !provisioned.has(o.id)),
			canCreateBrands,
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
	loader: async (): Promise<{
		brands: { id: string; name: string; website: string }[];
		unprovisionedOrgs: { id: string; name: string }[];
		canCreateBrands: boolean;
	}> => {
		return getBrandSwitcherData();
	},
	component: BrandSwitcherPage,
});

function BrandSwitcherPage() {
	const { brands: brandList, unprovisionedOrgs, canCreateBrands } = Route.useLoaderData();

	return (
		<FullPageCard title="Brand Switcher" subtitle="Select a brand to get started">
			<div className="flex flex-col space-y-3 min-w-[200px]">
				{brandList.length > 0 || unprovisionedOrgs.length > 0 ? (
					<>
						{brandList.map((brand) => (
							<Link
								key={brand.id}
								to="/app/$brand"
								params={{ brand: brand.id }}
								className={buttonVariants({ variant: "secondary" })}
							>
								<BrandLogo domain={brand.website} size="md" />
								{brand.name}
							</Link>
						))}
						{unprovisionedOrgs.map((org) => (
							<Link
								key={org.id}
								to="/app/$brand"
								params={{ brand: org.id }}
								className={buttonVariants({ variant: "outline" })}
							>
								Set up {org.name}
							</Link>
						))}
					</>
				) : (
					<p className="text-muted-foreground text-center">No brands available</p>
				)}
				{canCreateBrands && (
					<Link to="/app/new" className={buttonVariants({ variant: "outline" })}>
						+ Create new brand
					</Link>
				)}
			</div>
		</FullPageCard>
	);
}
