/**
 * GET /api/v1/brands/:brandId/query-fanout — the searches engines ran, a page at a time.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { publicRange, resolveAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { analyticsListPaging, analyticsQuery, offsetOf, paginationOf } from "@/lib/api/query";
import { brandQueryFanoutSchema } from "@/lib/api/schemas/query-fanout";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandFanoutQueries } from "@/server/analytics-core";

const queryFanoutQuery = analyticsQuery.extend({
	...analyticsListPaging,
	q: z.string().optional(),
});

export const Route = createFileRoute("/api/v1/brands/$brandId/query-fanout")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: brandQueryFanoutSchema,
				query: queryFanoutQuery,
				scopes: ["read"],
				handle: async ({ params, query, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const range = resolveAnalyticsWindow(query.start, query.end);
					const { queries, total, ...totals } = await getBrandFanoutQueries(
						brand.id,
						range,
						{ model: query.model, tags: query.tags },
						{ search: query.q, limit: query.limit, offset: offsetOf(query) },
					);
					return {
						brandId: brand.id,
						range: publicRange(range),
						...totals,
						data: queries,
						pagination: paginationOf(query, total),
					};
				},
			}),
		}),
	},
});
