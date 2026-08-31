/**
 * GET /api/v1/brands/:brandId/citations/urls — cited urls over the window,
 * compared against the equal-length window immediately before it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandCitations } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/citations/urls")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const { urls, totals } = await getBrandCitations(brand.id, range, parseAnalyticsFilters(url));
					return {
						brandId: brand.id,
						range,
						totals: { citations: totals.citations, uniqueDomains: totals.uniqueDomains, uniqueUrls: totals.uniqueUrls },
						data: urls,
					};
				},
			}),
		}),
	},
});
