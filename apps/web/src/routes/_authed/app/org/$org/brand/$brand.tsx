/**
 * /app/org/$org/brand/$brand layout - Brand-specific layout with sidebar
 *
 * Fetches brand data and provides it to child routes.
 * Shows sidebar navigation, header, and optional demo banner.
 */

import { createFileRoute, notFound, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { BRAND_SEGMENT_INDEX, brandSegment, canonicalHref } from "@workspace/lib/app-urls";
import { db } from "@workspace/lib/db/db";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { getOrgBillingState } from "@workspace/lib/entitlements";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { validateBrandFilterSearch } from "@/hooks/use-list-filters";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { getAppName } from "@/lib/route-head";

interface BrandRouteData {
	brand: BrandWithPrompts;
	/** The org that must be subscribed before this brand renders; null when nothing is owed. */
	unpaidOrganizationId: string | null;
}

const getBrandData = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string(), brandId: z.string() }))
	.handler(async ({ data }): Promise<BrandRouteData> => {
		const session = await requireAuthSession();
		// The layout resolved this brand inside a workspace the caller belongs to,
		// but a server function is reachable on its own — so membership is checked
		// again here rather than trusted from the caller.
		await requireOrgAccess(session.user.id, data.organizationId);

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		// A brand owned by a different workspace is as good as absent, including to
		// a user who happens to belong to both.
		if (!brand || brand.organizationId !== data.organizationId) throw notFound();

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
			<div className="space-y-2">
				<Skeleton className="h-9 w-48" />
				<Skeleton className="h-5 w-80" />
			</div>
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-64 w-full rounded-lg" />
				<Skeleton className="h-64 w-full rounded-lg" />
			</div>
		</AppShell>
	);
}

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand")({
	// The shared dashboard filters (model/lookback/tags/q) are validated here
	// once so every child route inherits them in its search schema. The loader
	// has no `loaderDeps`, so filter-only navigations never re-run it.
	validateSearch: validateBrandFilterSearch,
	// The segment can be either the brand's slug or its id. The workspace layout
	// above already listed every brand this workspace owns, so resolving it is a
	// lookup in memory rather than a round trip; putting the id in context is what
	// lets everything below — loaders, hooks, query keys — go on speaking in ids
	// without caring which form the URL took.
	beforeLoad: ({ params, location, context }): { brandId: string } => {
		const brand = context.workspace.brands.find((b) => b.slug === params.brand || b.id === params.brand);
		if (!brand) throw notFound();

		const canonical = brandSegment(brand);
		if (canonical !== params.brand) {
			throw redirect({ href: canonicalHref(location, BRAND_SEGMENT_INDEX, canonical) });
		}

		return { brandId: brand.id };
	},
	loader: async ({ context }): Promise<BrandRouteData> => {
		const result = await getBrandData({
			data: { organizationId: context.workspace.id, brandId: context.brandId },
		});

		// Scoped to this brand's workspace, and says which one — the /app gate only
		// knows whether the user has *any* entitled org, which is a different
		// question and would send a mixed-membership user to the wrong checkout.
		if (result.unpaidOrganizationId) {
			throw redirect({ to: "/choose-plan", search: { org: result.unpaidOrganizationId } });
		}

		return result;
	},
	head: ({ match, loaderData }) => {
		const appName = getAppName(match);
		const brandName = (loaderData as BrandRouteData | undefined)?.brand.name;
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
	const { workspace, isAdmin, hasReportAccess } = Route.useRouteContext();
	const { brand } = Route.useLoaderData();

	return (
		<AppShell
			sidebar={<AppSidebar isAdmin={isAdmin} hasReportAccess={hasReportAccess} brand={brand} workspace={workspace} />}
			header={<SiteHeader workspaceName={workspace.name} />}
		>
			<Outlet />
		</AppShell>
	);
}
