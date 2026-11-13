/**
 * A whitelist on purpose: the stored `report` column is model output, and
 * returning it whole would make whatever the generator wrote part of this
 * contract.
 */
import type * as z from "zod";
import type { brandOpportunitiesSchema } from "@/lib/api/schemas/opportunities";
import { resolveOpportunities } from "./opportunities";

export type PublishedOpportunities = z.infer<typeof brandOpportunitiesSchema>;

export async function publishedOpportunities(brandId: string): Promise<PublishedOpportunities> {
	const result = await resolveOpportunities(brandId, "UTC");
	const opportunities = result.report?.opportunities ?? [];

	return {
		brandId,
		// So a caller never has to tell "none" from "not enough data yet".
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
}
