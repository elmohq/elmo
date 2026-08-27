/**
 * GET /api/v1/brands/:brandId/share-of-voice — the brand against its rivals.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
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
					const { entries, brandShare, ...rest } = await getBrandShareOfVoice(
						brand.id,
						range,
						parseAnalyticsFilters(url),
					);
					// The core keeps exact ratios so each surface can round once. This
					// is the wire's turn: percentages, rounded here and nowhere else.
					const asPercent = (ratio: number) => Math.round(ratio * 100);
					return {
						brandId: brand.id,
						range,
						...rest,
						brandShare: brandShare === null ? null : asPercent(brandShare),
						entries: entries.map((entry) => ({ ...entry, share: asPercent(entry.share) })),
					};
				},
			}),
		}),
	},
});
