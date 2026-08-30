/**
 * The brand's own pages, and the rail and header around them.
 *
 * The `$brand` segment resolves against the brand list the organization layout
 * already holds, so the id every page below speaks in costs no round trip.
 */

import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { brandSegment, canonicalBrandHref, resolveSegment } from "@workspace/lib/app-urls";
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
		// A server function is reachable on its own, so membership is checked here
		// rather than trusted from the caller. Independent of the brand read.
		const [, brand] = await Promise.all([
			requireOrgAccess(session.user.id, data.organizationId),
			db.query.brands.findFirst({ where: eq(brands.id, data.brandId) }),
		]);

		// Null rather than a throw, because a server function can't carry the
		// router's notFound payload — the loader turns this into the 404.
		if (!brand || brand.organizationId !== data.organizationId) {
			return null;
		}

		const [brandPrompts, brandCompetitors, { entitlements }] = await Promise.all([
			db.query.prompts.findMany({ where: eq(prompts.brandId, brand.id) }),
			db.query.competitors.findMany({ where: eq(competitors.brandId, brand.id) }),
			// Outside cloud this resolves without touching the database.
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
	// Validated once here, so every child route inherits them. The loader has no
	// `loaderDeps`, so filter-only navigations never re-run it.
	validateSearch: validateBrandFilterSearch,
	// Putting the id in context is what lets everything below — loaders, hooks,
	// query keys — speak in ids without caring which form the URL took.
	beforeLoad: ({ params, location, context }): { brandId: string } => {
		// Slug-first precedence lives in `resolveSegment`.
		const { brands: owned } = context.organization;
		const brand = resolveSegment(owned, params.brand);
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

		// Names the organization, because the /app gate only knows whether the user
		// has *any* entitled org — a different question, and one that would send a
		// mixed-membership user to the wrong checkout.
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
	// Brand data rarely changes, and the hooks re-fetch it. Writes that move the
	// name or slug call `router.invalidate()` so the crumb and title keep up.
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
