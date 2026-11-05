/**
 * GET /api/v1/brands/:brandId/citations/urls — cited urls over the window,
 * compared against the equal-length window immediately before it, a page at a time.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
	analyticsListPaging,
	pagination,
	parseAnalyticsFilters,
	parseAnalyticsWindow,
	publicRange,
} from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandCitationUrls } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/citations/urls")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const { page, limit, offset } = analyticsListPaging(url.searchParams);
					const { urls, total, totals } = await getBrandCitationUrls(brand.id, range, parseAnalyticsFilters(url), {
						search: url.searchParams.get("q") ?? undefined,
						category: url.searchParams.get("category") ?? undefined,
						pageType: url.searchParams.get("pageType") ?? undefined,
						limit,
						offset,
					});
					return {
						brandId: brand.id,
						range: publicRange(range),
						totals,
						data: urls,
						pagination: pagination(page, limit, total),
					};
				},
			}),
		}),
	},
});
