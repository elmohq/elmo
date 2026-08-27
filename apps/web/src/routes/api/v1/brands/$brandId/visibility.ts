/**
 * GET /api/v1/brands/:brandId/visibility — daily visibility and period totals.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandVisibility } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/visibility")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const result = await getBrandVisibility(brand.id, range, parseAnalyticsFilters(url));
					return { brandId: brand.id, range, ...result };
				},
			}),
		}),
	},
});
