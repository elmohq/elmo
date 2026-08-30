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
	unpaidOrganizationId: string | null;
}

const getBrandData = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string(), brandId: z.string() }))
	.handler(async ({ data }): Promise<BrandData | null> => {
		const session = await requireAuthSession();
		const [, brand] = await Promise.all([
			requireOrgAccess(session.user.id, data.organizationId),
			db.query.brands.findFirst({ where: eq(brands.id, data.brandId) }),
		]);

		if (!brand || brand.organizationId !== data.organizationId) {
			return null;
		}

		const [brandPrompts, brandCompetitors, { entitlements }] = await Promise.all([
			db.query.prompts.findMany({ where: eq(prompts.brandId, brand.id) }),
			db.query.competitors.findMany({ where: eq(competitors.brandId, brand.id) }),
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
	validateSearch: validateBrandFilterSearch,
	beforeLoad: ({ params, location, context }): { brandId: string } => {
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
