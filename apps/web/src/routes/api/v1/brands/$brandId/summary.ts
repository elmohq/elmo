/**
 * GET /api/v1/brands/:brandId/summary — every headline figure in one request.
 */
import { createFileRoute } from "@tanstack/react-router";
import { asPercent, parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandSummary } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/summary")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const { shareOfVoice, ...summary } = await getBrandSummary(brand.id, range, parseAnalyticsFilters(url));
					// Every other figure here is already 0–100; share of voice is the one
					// the core hands over as an exact ratio.
					return { brandId: brand.id, range, ...summary, shareOfVoice: asPercent(shareOfVoice) };
				},
			}),
		}),
	},
});
