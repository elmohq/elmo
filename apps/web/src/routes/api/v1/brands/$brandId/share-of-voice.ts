/**
 * GET /api/v1/brands/:brandId/share-of-voice — the brand against its rivals.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandShareOfVoice } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/share-of-voice")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const result = await getBrandShareOfVoice(brand.id, range, parseAnalyticsFilters(url));
					return { brandId: brand.id, range, ...result };
				},
			}),
		}),
	},
});
