/** The analytics reads as Postgres answers them; server only. */
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import type { AnalyticsBrandRow, AnalyticsCompetitorRow, AnalyticsPromptRow } from "@/lib/analytics/entities";

export {
	getCitationDomainPage,
	getCitationFlowRows,
	getCitationSummary,
	getCitationTotals,
	getCitationUrlPage,
	getDomainPromptCounts,
} from "@/lib/citation-read";
export { getSentimentQuotes } from "@/lib/postgres-read";
export {
	getBrandEarliestRunDate,
	getCitationsCountByModel,
	getCitationTotal,
	getCitationUrlStats,
	getCompetitorTotals,
	getDailyAssessments,
	getFanoutBreakdown,
	getFanoutModelTotals,
	getFanoutPromptTotals,
	getFanoutQueryPage,
	getFanoutQueryTotals,
	getMentionTotals,
	getPerPromptCitationDomains,
	getPerPromptCitationPages,
	getPerPromptDailyCitationClasses,
	getPerPromptDailyCitationDomains,
	getPerPromptDailyCompetitors,
	getPerPromptDailyRuns,
	getPerPromptGooglePages,
	getPerPromptRunStats,
	getPromptModelDailyCompetitors,
	getPromptModelDailyRuns,
	getPromptsFirstEvaluatedAt,
	getRunsByModel,
	getVisibilityDailyAggregate,
} from "@/lib/rollup-read";

export async function getBrandRow(brandId: string): Promise<AnalyticsBrandRow | undefined> {
	const [row] = await db
		.select({
			id: brands.id,
			name: brands.name,
			website: brands.website,
			additionalDomains: brands.additionalDomains,
			delayOverrideHours: brands.delayOverrideHours,
		})
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	return row ? { ...row, additionalDomains: row.additionalDomains ?? [] } : undefined;
}

export async function getCompetitorRows(brandId: string): Promise<AnalyticsCompetitorRow[]> {
	return db
		.select({ id: competitors.id, name: competitors.name, domains: competitors.domains })
		.from(competitors)
		.where(eq(competitors.brandId, brandId))
		.orderBy(asc(competitors.createdAt), asc(competitors.id));
}

/** Newest first, as the prompt list shows them. */
export async function getPromptRows(brandId: string): Promise<AnalyticsPromptRow[]> {
	const rows = await db
		.select({
			id: prompts.id,
			value: prompts.value,
			tags: prompts.tags,
			systemTags: prompts.systemTags,
			enabled: prompts.enabled,
			createdAt: prompts.createdAt,
		})
		.from(prompts)
		.where(eq(prompts.brandId, brandId))
		.orderBy(desc(prompts.createdAt), asc(prompts.id));
	return rows.map((row) => ({ ...row, tags: row.tags ?? [], systemTags: row.systemTags ?? [] }));
}
