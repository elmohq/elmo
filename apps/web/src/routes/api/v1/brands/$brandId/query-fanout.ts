/**
 * GET /api/v1/brands/:brandId/query-fanout — the searches engines ran.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandQueryFanout } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/query-fanout")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const analysis = await getBrandQueryFanout(brand.id, range, parseAnalyticsFilters(url), {
						uncapped: true,
					});
					// topByRuns carries both figures per query; topQueries carries only
					// an instance count.
					const queries = analysis.topByRuns.map((entry) => ({
						query: entry.query,
						runs: entry.runs,
						promptCount: entry.prompts,
					}));
					return {
						brandId: brand.id,
						range,
						totalQueries: analysis.totalQueries,
						uniqueQueries: analysis.uniqueQueries,
						fanoutRuns: analysis.fanoutRuns,
						totalRuns: analysis.totalRuns,
						avgQueriesPerRun: analysis.avgPerExecution,
						coverageRate: analysis.coverageRate,
						data: queries,
					};
				},
			}),
		}),
	},
});
