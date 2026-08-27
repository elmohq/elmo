/**
 * GET /api/v1/brands/:brandId/query-fanout — the searches engines ran.
 */
import { createFileRoute } from "@tanstack/react-router";
import { paginate, parseAnalyticsFilters, parseAnalyticsWindow, parsePaging } from "@/lib/api/analytics-range";
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
					const { page, limit } = parsePaging(url);
					const { queries, ...totals } = await getBrandQueryFanout(brand.id, range, parseAnalyticsFilters(url));
					return { brandId: brand.id, range, ...totals, ...paginate(queries, page, limit) };
				},
			}),
		}),
	},
});
