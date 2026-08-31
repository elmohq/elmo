/**
 * The latest opportunities report for a brand, as the external surfaces publish
 * it.
 *
 * Server-only and edge-agnostic, so `/api/v1/brands/{id}/opportunities` and the
 * MCP `get_opportunities` tool answer with one shape from one projection.
 *
 * That projection is the contract, and it is a whitelist on purpose. The stored
 * `report` column is model output: whatever the generator happened to write is
 * in there, and returning it whole would make the provider's shape ours — the
 * same reason `runs` publishes normalized answer text rather than `rawOutput`.
 */
import { db } from "@workspace/lib/db/db";
import { brandOpportunities } from "@workspace/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import type { CitedPage, OpportunitiesReport, ReportOpportunity } from "./opportunities";

/**
 * Why the lists are empty when they are, so a caller never has to tell "no
 * opportunities" from "not enough data yet" from "never generated".
 */
export type OpportunitiesStatus = "ready" | "insufficient-data" | "not-generated";

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
	generatedAt: Date | null;
	model: string | null;
	summary: string[];
	opportunities: PublishedOpportunity[];
	risks: string[];
}

export async function latestOpportunities(brandId: string): Promise<PublishedOpportunities> {
	const [row] = await db
		.select()
		.from(brandOpportunities)
		.where(eq(brandOpportunities.brandId, brandId))
		.orderBy(desc(brandOpportunities.createdAt))
		.limit(1);

	if (!row) {
		return {
			brandId,
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
		brandId,
		// A stored report with nothing in it is what "not enough tracked answers
		// yet" looks like on disk.
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
}
