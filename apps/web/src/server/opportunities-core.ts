/**
 * A whitelist on purpose: the stored `report` column is model output, and
 * returning it whole would make whatever the generator wrote part of this
 * contract.
 */
import type { CitedPage, OpportunitiesResponse, ReportOpportunity } from "./opportunities";
import { storedOpportunities } from "./opportunities";

/** So a caller never has to tell "none" from "not enough data yet" — or from a
 * brand nobody has generated a report for. */
type OpportunitiesStatus = "ready" | "insufficient-data" | "not-generated";

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

function statusOf(result: OpportunitiesResponse): OpportunitiesStatus {
	if ((result.report?.opportunities.length ?? 0) > 0) return "ready";
	return result.reason === "not-generated" ? "not-generated" : "insufficient-data";
}

export async function publishedOpportunities(brandId: string): Promise<PublishedOpportunities> {
	const result = await storedOpportunities(brandId);
	const opportunities = result.report?.opportunities ?? [];

	return {
		brandId,
		status: statusOf(result),
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
