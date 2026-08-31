/**
 * GET /api/v1/brands/:brandId/analytics — everything a brand's window says.
 *
 * One endpoint rather than a family of overlapping ones: visibility, share of
 * voice, the per-model breakdown and the citation totals are computed from the
 * same resolved prompt scope, so splitting them apart meant four requests
 * carrying the same window and filters to get one picture — and a `summary`
 * that duplicated a scalar from each while costing all four computations.
 *
 * There is no `include` parameter. The lists that can grow without bound have
 * their own paginated endpoints; what is left is small enough to always send.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandAnalytics } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/analytics")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const analytics = await getBrandAnalytics(brand.id, range, parseAnalyticsFilters(url));
					return { brandId: brand.id, range, ...analytics };
				},
			}),
		}),
	},
});
