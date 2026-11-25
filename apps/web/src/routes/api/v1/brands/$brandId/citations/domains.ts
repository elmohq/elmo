/**
 * GET /api/v1/brands/:brandId/citations/domains — cited domains over the window,
 * compared against the equal-length window immediately before it, a page at a time.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { publicRange, resolveAnalyticsWindow } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { analyticsListPaging, analyticsQuery, offsetOf, paginationOf } from "@/lib/api/query";
import { citationDomainListSchema } from "@/lib/api/schemas/citations";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandCitationDomains } from "@/server/analytics-core";

const listCitationDomainsQuery = analyticsQuery.extend({
	...analyticsListPaging,
	q: z.string().optional(),
	category: z.string().optional(),
});

export const Route = createFileRoute("/api/v1/brands/$brandId/citations/domains")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				response: citationDomainListSchema,
				query: listCitationDomainsQuery,
				scopes: ["read"],
				handle: async ({ params, query, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const range = resolveAnalyticsWindow(query.start, query.end);
					const { domains, total, totals } = await getBrandCitationDomains(
						brand.id,
						range,
						{ model: query.model, tags: query.tags },
						{ search: query.q, category: query.category, limit: query.limit, offset: offsetOf(query) },
					);
					return {
						brandId: brand.id,
						range: publicRange(range),
						totals,
						data: domains,
						pagination: paginationOf(query, total),
					};
				},
			}),
		}),
	},
});
