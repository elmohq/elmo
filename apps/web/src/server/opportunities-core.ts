/**
 * The latest opportunities report for a brand, as the external surfaces publish
 * it.
 *
 * Server-only and edge-agnostic, so `/api/v1/brands/{id}/opportunities` and the
 * MCP `get_opportunities` tool answer with one shape from one projection.
 *
 * That projection is a whitelist on purpose. The stored `report` column is model
 * output: whatever the generator happened to write is in there, and returning it
 * whole would make the provider's shape ours — the same reason runs publish
 * normalized answer text rather than `rawOutput`.
 */
import type { CitedPage, ReportOpportunity } from "./opportunities";
import { resolveOpportunities } from "./opportunities";

/**
 * Why the lists are empty when they are, so a caller never has to tell "no
 * opportunities" from "not enough data yet".
 */
export type OpportunitiesStatus = "ready" | "insufficient-data";

export interface PublishedOpportunity {
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
