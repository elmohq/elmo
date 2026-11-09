/** Named apart from `/brands/:brandId/prompts` so that path stays free for
 * nested prompt CRUD: this returns results, not configuration. */
import { createFileRoute } from "@tanstack/react-router";
import { publicRange, resolveAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { analyticsQuery } from "@/lib/api/query";
import { promptPerformanceListSchema } from "@/lib/api/schemas/prompt-performance";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandPromptPerformance } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/prompt-performance")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: promptPerformanceListSchema,
				query: analyticsQuery,
				scopes: ["read"],
				handle: async ({ params, query: { start, end, ...filters }, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const range = resolveAnalyticsWindow(start, end);
					const rows = await getBrandPromptPerformance(brand.id, range, filters);
					return { brandId: brand.id, range: publicRange(range), data: rows };
				},
			}),
		}),
	},
});
