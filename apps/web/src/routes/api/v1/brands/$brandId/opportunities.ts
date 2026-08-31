/**
 * GET /api/v1/brands/:brandId/opportunities — the latest report.
 *
 * Read-only, and deliberately no POST to regenerate: producing a report spends
 * provider budget with nothing metering it per call, the same reason
 * /tools/analyze stays admin-only. Elmo decides when one is stale; this returns
 * the newest row of an append-only history.
 *
 * `status` says why the lists are empty when they are, so a caller never has to
 * tell "no opportunities" from "not enough data yet" from "never generated".
 */
import { createFileRoute } from "@tanstack/react-router";
import { db } from "@workspace/lib/db/db";
import { brandOpportunities } from "@workspace/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import type { OpportunitiesReport } from "@/server/opportunities";

export const Route = createFileRoute("/api/v1/brands/$brandId/opportunities")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);

					const [row] = await db
						.select()
						.from(brandOpportunities)
						.where(eq(brandOpportunities.brandId, brand.id))
						.orderBy(desc(brandOpportunities.createdAt))
						.limit(1);

					if (!row) {
						return {
							brandId: brand.id,
							status: "not-generated",
							generatedAt: null,
							model: null,
							summary: [],
							opportunities: [],
							risks: [],
						};
					}

					const report = row.report as OpportunitiesReport;
					const opportunities = report.opportunities ?? [];

					return {
						brandId: brand.id,
						// A stored report with nothing in it is what "not enough tracked
						// answers yet" looks like on disk.
						status: opportunities.length > 0 ? "ready" : "insufficient-data",
						generatedAt: row.createdAt,
						model: row.model,
						summary: report.summary ?? [],
						opportunities: opportunities.map((item) => ({
							category: item.category,
							title: item.title,
							why: item.why,
							relatedPrompts: (item.relatedPrompts ?? []).map((prompt) => ({
								text: prompt.text,
								promptId: prompt.promptId,
							})),
							yourCitations: item.yourCitations ?? [],
							competitorCitations: item.competitorCitations ?? [],
						})),
						risks: report.risks ?? [],
					};
				},
			}),
		}),
	},
});
