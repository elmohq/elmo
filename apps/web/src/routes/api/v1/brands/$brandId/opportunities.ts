/**
 * GET /api/v1/brands/:brandId/opportunities — the brand's Opportunities report.
 *
 * Generation is inline and synchronous, exactly as it is for the dashboard:
 * both call `resolveOpportunities`, which serves the stored report while it is
 * fresh and produces a new one when it isn't. So there is nothing to poll for
 * and no "processing" state to report — a caller either gets the current report
 * or waits for the one its own request caused. The freshness window is what
 * bounds the spend: however many callers ask, one generation per brand per
 * window.
 *
 * There is deliberately no POST. Regeneration on demand would spend provider
 * budget with nothing metering it per call, which is the same reason
 * /tools/analyze stays admin-only.
 *
 * `status` says why the lists are empty when they are, so a caller never has to
 * tell "no opportunities" from "not enough data yet".
 */
import { createFileRoute } from "@tanstack/react-router";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { resolveOpportunities } from "@/server/opportunities";

export const Route = createFileRoute("/api/v1/brands/$brandId/opportunities")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["analytics:read"],
				handle: async ({ params, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const result = await resolveOpportunities(brand.id, "UTC");
					const opportunities = result.report?.opportunities ?? [];

					return {
						brandId: brand.id,
						status: opportunities.length > 0 ? "ready" : "insufficient-data",
						generatedAt: result.lastEvaluatedAt,
						model: result.model,
						summary: result.report?.summary ?? [],
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
						risks: result.report?.risks ?? [],
					};
				},
			}),
		}),
	},
});
