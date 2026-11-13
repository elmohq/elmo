/**
 * One endpoint rather than several: visibility, share of voice, the per-model
 * breakdown, the citation totals, and sentiment and position cover the same prompts.
 * No `include` parameter — the lists that can grow without bound have their own
 * paginated endpoints, and what is left is small enough to always send.
 */
import { createFileRoute } from "@tanstack/react-router";
import { publicRange, resolveAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { analyticsQuery } from "@/lib/api/query";
import { brandAnalyticsSchema } from "@/lib/api/schemas/analytics";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandAnalytics } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/analytics")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: brandAnalyticsSchema,
				query: analyticsQuery,
				scopes: ["read"],
				handle: async ({ params, query: { start, end, ...filters }, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const range = resolveAnalyticsWindow(start, end);
					const analytics = await getBrandAnalytics(brand.id, range, filters);
					return { brandId: brand.id, range: publicRange(range), ...analytics };
				},
			}),
		}),
	},
});
