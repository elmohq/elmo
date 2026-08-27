/**
 * GET /api/v1/brands/:brandId/platforms — visibility per answer engine.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandPlatformBreakdown } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/platforms")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const data = await getBrandPlatformBreakdown(brand.id, range, parseAnalyticsFilters(url));
					return { brandId: brand.id, range, data };
				},
			}),
		}),
	},
});
