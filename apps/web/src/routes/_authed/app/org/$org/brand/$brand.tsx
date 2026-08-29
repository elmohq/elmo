/**
 * /app/org/$org/brand/$brand layout — the brand's own pages, and the rail and
 * header around them.
 *
 * The `$brand` segment resolves against the brand list the organization layout
 * already holds, so the id every page below speaks in costs no round trip. The
 * loader fetches the brand itself and the paywall verdict for its organization.
 */

import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { brandSegment, canonicalBrandHref } from "@workspace/lib/app-urls";
import { db } from "@workspace/lib/db/db";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { getOrgBillingState } from "@workspace/lib/entitlements";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppShell, PageContent } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { validateBrandFilterSearch } from "@/hooks/use-list-filters";
import { useOrganization } from "@/hooks/use-organizations";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { getAppName } from "@/lib/route-head";

interface BrandData {
	brand: BrandWithPrompts;
	/** The org that must be subscribed before this brand renders; null when nothing is owed. */
	unpaidOrganizationId: string | null;
}

const getBrandData = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string(), brandId: z.string() }))
	.handler(async ({ data }): Promise<BrandData | null> => {
		const session = await requireAuthSession();
		// The layout resolved this brand inside an organization the caller belongs to,
		// but a server function is reachable on its own — so membership is checked
		// again here rather than trusted from the caller. Independent of the brand
		// read, so the two go together.
		const [, brand] = await Promise.all([
			requireOrgAccess(session.user.id, data.organizationId),
			db.query.brands.findFirst({ where: eq(brands.id, data.brandId) }),
		]);

		// The layout already found this brand in the organization, so reaching here
		// means the caller came straight to the function or the brand went away
		// underneath us. Reported as null so the loader turns it into a 404 —
		// the server function can't throw the router's notFound payload itself.
		if (!brand || brand.organizationId !== data.organizationId) {
			return null;
		}

		const [brandPrompts, brandCompetitors, { entitlements }] = await Promise.all([
			db.query.prompts.findMany({ where: eq(prompts.brandId, brand.id) }),
			db.query.competitors.findMany({ where: eq(competitors.brandId, brand.id) }),
			// Paywall signal (cloud only): outside cloud this resolves without
			// touching the database.
			getOrgBillingState(brand.organizationId),
		]);

		return {
			brand: { ...brand, prompts: brandPrompts, competitors: brandCompetitors },
			unpaidOrganizationId: entitlements.standing === "none" ? brand.organizationId : null,
		};
	});

function BrandLayoutSkeleton() {
	return (
		<AppShell
			sidebar={
				<div className="w-[var(--sidebar-width)] shrink-0 hidden md:block">
					<div className="flex flex-col gap-4 p-4">
						<Skeleton className="h-8 w-full" />
						<div className="space-y-2">
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
							<Skeleton className="h-8 w-full" />
						</div>
					</div>
				</div>
			}
			header={
				<div className="flex h-14 items-center gap-2 px-4 border-b">
					<Skeleton className="h-6 w-6" />
					<Skeleton className="h-5 w-32" />
				</div>
			}
		>
			<PageContent>
				<div className="space-y-2">
					<Skeleton className="h-9 w-48" />
					<Skeleton className="h-5 w-80" />
				</div>
				<div className="space-y-4">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-64 w-full rounded-lg" />
					<Skeleton className="h-64 w-full rounded-lg" />
				</div>
			</PageContent>
		</AppShell>
	);
}

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand")({
	// The shared dashboard filters (model/lookback/tags/q) are validated here
	// once so every child route inherits them in its search schema. The loader
	// has no `loaderDeps`, so filter-only navigations never re-run it.
	validateSearch: validateBrandFilterSearch,
	// The segment can be either the brand's slug or its id. The organization layout
	// above already listed every brand this organization owns, so resolving it is a
	// lookup in memory rather than a round trip; putting the id in context is what
	// lets everything below — loaders, hooks, query keys — go on speaking in ids
	// without caring which form the URL took.
	beforeLoad: ({ params, location, context }): { brandId: string } => {
		// Slug first: a brand's id and another brand's slug can both be the segment,
		// and which one the URL names should not depend on the order brands sort in.
		const { brands: owned } = context.organization;
		const brand = owned.find((b) => b.slug === params.brand) ?? owned.find((b) => b.id === params.brand);
		if (!brand) throw notFound();

		const canonical = brandSegment(brand);
		if (canonical !== params.brand) {
			throw redirect({ href: canonicalBrandHref(location, canonical) });
		}

		return { brandId: brand.id };
	},
	loader: async ({ context }): Promise<BrandData> => {
		const result = await getBrandData({
			data: { organizationId: context.organization.id, brandId: context.brandId },
		});
		if (!result) throw notFound();

		// Scoped to this brand's organization, and says which one — the /app gate only
		// knows whether the user has *any* entitled org, which is a different
		// question and would send a mixed-membership user to the wrong checkout.
		if (result.unpaidOrganizationId) {
			throw redirect({ to: "/choose-plan", search: { org: result.unpaidOrganizationId } });
		}

		return result;
	},
	head: ({ match, loaderData }) => {
		const appName = getAppName(match);
		const brandName = (loaderData as BrandData | undefined)?.brand?.name;
		return {
			meta: [
				{ title: brandName ? `${brandName} · ${appName}` : appName },
				{
					name: "description",
					content: brandName ? `AI visibility tracking for ${brandName}.` : "AI visibility tracking and optimization.",
				},
			],
		};
	},
	// Cache brand data for 5 minutes — it rarely changes and is re-fetched by TanStack Query hooks
	staleTime: 5 * 60 * 1000,
	pendingComponent: BrandLayoutSkeleton,
	component: BrandLayout,
});

function BrandLayout() {
	const { brand } = Route.useLoaderData();
	const organization = useOrganization();

	return (
		<AppShell sidebar={<AppSidebar scope="brand" brand={brand} organization={organization} />} header={<SiteHeader />}>
			<PageContent>
				<Outlet />
			</PageContent>
		</AppShell>
	);
}
