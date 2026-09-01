/**
 * GET /api/v1/brands/:brandId/prompt-performance — per-prompt results.
 *
 * Named apart from `/brands/:brandId/prompts` so that path stays free if nested
 * prompt CRUD is ever wanted: this returns results, not configuration.
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyticsFilters, parseAnalyticsWindow, publicRange } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandPromptPerformance } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/prompt-performance")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const rows = await getBrandPromptPerformance(brand.id, range, parseAnalyticsFilters(url));
					return { brandId: brand.id, range: publicRange(range), data: rows };
				},
			}),
		}),
	},
});
