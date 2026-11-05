/**
 * A whitelist on purpose: the stored `report` column is model output, and
 * returning it whole would make whatever the generator wrote part of this
 * contract.
 */
import type { CitedPage, ReportOpportunity } from "./opportunities";
import { resolveOpportunities } from "./opportunities";

/** So a caller never has to tell "none" from "not enough data yet". */
type OpportunitiesStatus = "ready" | "insufficient-data";

interface PublishedOpportunity {
	category: ReportOpportunity["category"];
	title: string;
	why: string;
	relatedPrompts: Array<{ text: string; promptId: string | null }>;
	yourCitations: CitedPage[];
	competitorCitations: CitedPage[];
}

export interface PublishedOpportunities {
	brandId: string;
	status: OpportunitiesStatus;
	generatedAt: string | null;
	model: string | null;
	summary: string[];
	opportunities: PublishedOpportunity[];
	risks: string[];
}

export async function publishedOpportunities(brandId: string): Promise<PublishedOpportunities> {
	const result = await resolveOpportunities(brandId, "UTC");
	const opportunities = result.report?.opportunities ?? [];

	return {
		brandId,
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
