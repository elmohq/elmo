/**
 * GET /api/v1/brands/:brandId/share-of-voice — the brand against its rivals.
 */
import { createFileRoute } from "@tanstack/react-router";
import { asPercent, parseAnalyticsFilters, parseAnalyticsWindow } from "@/lib/api/analytics-range";
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
					// The leaderboard and the headline arrive as exact ratios and are
					// rounded here; the daily series is already a percentage. Converting
					// only the first two is what keeps the whole response in one unit.
					return {
						brandId: brand.id,
						range,
						...rest,
						brandShare: asPercent(brandShare),
						entries: entries.map((entry) => ({ ...entry, share: asPercent(entry.share) })),
					};
				},
			}),
		}),
	},
});
