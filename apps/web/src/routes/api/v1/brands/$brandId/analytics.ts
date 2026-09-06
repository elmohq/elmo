/**
 * One endpoint rather than four: visibility, share of voice, the per-model
 * breakdown and the citation totals come off the same resolved prompt scope.
 * No `include` parameter — the lists that can grow without bound have their own
 * paginated endpoints, and what is left is small enough to always send.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyticsFilters, parseAnalyticsWindow, publicRange } from "@/lib/api/analytics-range";
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
					return { brandId: brand.id, range: publicRange(range), ...analytics };
				},
			}),
		}),
	},
});
