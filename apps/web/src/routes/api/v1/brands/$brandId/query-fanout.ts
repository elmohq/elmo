/**
 * GET /api/v1/brands/:brandId/query-fanout — the searches engines ran, a page at a time.
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
import { getBrandFanoutQueries } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/query-fanout")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const { page, limit, offset } = analyticsListPaging(url.searchParams);
					const { queries, total, ...totals } = await getBrandFanoutQueries(
						brand.id,
						range,
						parseAnalyticsFilters(url),
						{ search: url.searchParams.get("q") ?? undefined, limit, offset },
					);
					return {
						brandId: brand.id,
						range: publicRange(range),
						...totals,
						data: queries,
						pagination: pagination(page, limit, total),
					};
				},
			}),
		}),
	},
});
