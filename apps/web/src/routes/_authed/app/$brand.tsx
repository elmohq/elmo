/**
 * /app/$brand layout - Brand-specific layout with sidebar
 *
 * Fetches brand data and provides it to child routes.
 * Shows sidebar navigation, header, and optional demo banner.
 * If brand exists in auth but not in DB, shows onboarding.
 */
import { createFileRoute, Outlet, notFound, redirect } from "@tanstack/react-router";
import { getAppName } from "@/lib/route-head";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDeployment } from "@/lib/config/server";
import { getOnboardingPlatformStateFn } from "@/server/brands";
import type { OnboardingPlatformState } from "@/server/brands";
import {
	requireAuthSession,
	isAdmin,
	hasReportAccess,
	checkOrgAccess,
	listUserOrganizations,
} from "@/lib/auth/helpers";
import { db } from "@workspace/lib/db/db";
import { brands, prompts, competitors } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import BrandOnboarding from "@/components/brand-onboarding";
import { getOrgBillingState } from "@workspace/lib/entitlements";
import { validateBrandFilterSearch } from "@/hooks/use-list-filters";

const getBrandData = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(
		async ({
			data,
		}): Promise<{
			brand: BrandWithPrompts | null;
			brandName: string | null;
			isAdmin: boolean;
			hasReportAccess: boolean;
			hasAccess: boolean;
			needsPlan: boolean;
		}> => {
			const session = await requireAuthSession();

			const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });

			if (brand) {
				const hasAccess = await checkOrgAccess(session.user.id, brand.organizationId);
				if (!hasAccess) {
					return {
						brand: null,
						brandName: null,
						isAdmin: false,
						hasReportAccess: false,
						hasAccess: false,
						needsPlan: false,
					};
				}

				const brandPrompts = await db.query.prompts.findMany({
					where: eq(prompts.brandId, data.brandId),
				});
				const brandCompetitors = await db.query.competitors.findMany({
					where: eq(competitors.brandId, data.brandId),
				});

				// Paywall signal (cloud only): outside cloud this resolves without
				// touching the database.
				const { entitlements } = await getOrgBillingState(brand.organizationId);

				return {
					brand: {
						...brand,
						prompts: brandPrompts,
						competitors: brandCompetitors,
					},
					brandName: brand.name,
					isAdmin: isAdmin(session),
					hasReportAccess: hasReportAccess(session),
					hasAccess: true,
					needsPlan: entitlements.standing === "none",
				};
			}

			// No brand row: legacy onboarding path where the URL param is an org id
			// (brand.id === org.id). Whitelabel empty-org onboarding depends on this.
			const hasAccess = await checkOrgAccess(session.user.id, data.brandId);
			if (!hasAccess) {
				return {
					brand: null,
					brandName: null,
					isAdmin: false,
					hasReportAccess: false,
					hasAccess: false,
					needsPlan: false,
				};
			}

			const orgs = await listUserOrganizations(session.user.id);
			const orgMeta = orgs.find((o) => o.id === data.brandId);

			return {
				brand: null,
				brandName: orgMeta?.name || data.brandId,
				isAdmin: isAdmin(session),
				hasReportAccess: hasReportAccess(session),
				hasAccess: true,
				needsPlan: false,
			};
		},
	);

function BrandLayoutSkeleton() {
	return (
		<SidebarProvider>
			{/* Sidebar skeleton */}
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
			{/* `overflow-clip` rather than `overflow-hidden`: both clip to the rounded
			    corners, but `hidden` makes this a scroll container, which stops
			    descendants from sticking to the viewport (the site header included). */}
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-clip">
				{/* Header skeleton */}
				<div className="flex h-14 items-center gap-2 px-4 border-b">
					<Skeleton className="h-6 w-6" />
					<Skeleton className="h-5 w-32" />
				</div>
				{/* Content skeleton */}
				<div className="flex flex-1 flex-col">
					<div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
						<div className="space-y-2">
							<Skeleton className="h-9 w-48" />
							<Skeleton className="h-5 w-80" />
						</div>
						<div className="space-y-4">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-64 w-full rounded-lg" />
							<Skeleton className="h-64 w-full rounded-lg" />
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export const Route = createFileRoute("/_authed/app/$brand")({
	// The shared dashboard filters (model/lookback/tags/q) are validated here
	// once so every child route inherits them in its search schema. The loader
	// has no `loaderDeps`, so filter-only navigations never re-run it.
	validateSearch: validateBrandFilterSearch,
	loader: async ({
		params,
	}): Promise<{
		brand: BrandWithPrompts | null;
		brandName: string | null;
		isAdmin: boolean;
		hasReportAccess: boolean;
		needsOnboarding: boolean;
		onboardingPlatformState: OnboardingPlatformState | null;
	}> => {
		const result = await getBrandData({ data: { brandId: params.brand } });

		if (!result.hasAccess) {
			throw notFound();
		}

		if (result.needsPlan) {
			throw redirect({ to: "/choose-plan" });
		}

		const onboardingPlatformState =
			result.brand === null && result.hasAccess
				? await getOnboardingPlatformStateFn({ data: { organizationId: params.brand } })
				: null;

		return {
			brand: result.brand,
			brandName: result.brandName,
			isAdmin: result.isAdmin,
			hasReportAccess: result.hasReportAccess,
			needsOnboarding: result.hasAccess && !result.brand,
			onboardingPlatformState,
		};
	},
	head: ({ match, loaderData }) => {
		const appName = getAppName(match);
		const brandName = (loaderData as { brandName?: string | null } | undefined)?.brandName;
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
	const { brand, brandName, isAdmin, hasReportAccess, needsOnboarding, onboardingPlatformState } =
		Route.useLoaderData();
	const { brand: brandId } = Route.useParams();

	// Brand exists in auth but not in DB - show onboarding
	if (needsOnboarding) {
		return (
			<BrandOnboarding
				brandId={brandId}
				brandName={brandName || brandId}
				platformState={onboardingPlatformState}
			/>
		);
	}

	return (
		<SidebarProvider>
			<AppSidebar isAdmin={isAdmin} hasReportAccess={hasReportAccess} brand={brand} />
			{/* `overflow-clip` rather than `overflow-hidden`: both clip to the rounded
			    corners, but `hidden` makes this a scroll container, which stops
			    descendants from sticking to the viewport (the site header included). */}
			<SidebarInset className="md:border md:border-border/60 md:rounded-xl overflow-clip">
				<SiteHeader />
				<div className="flex flex-1 flex-col">
					<div className="@container/main flex flex-1 flex-col gap-2">
						<div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
							<Outlet />
						</div>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
