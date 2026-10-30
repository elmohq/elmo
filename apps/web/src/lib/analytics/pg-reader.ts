import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import type { AnalyticsBrandRow, AnalyticsCompetitorRow, AnalyticsPromptRow } from "@/lib/analytics/entities";
import { queryPg } from "@/lib/analytics/pg-query";
import type { AnalyticsReader } from "@/lib/analytics/reader";
import { citationReads } from "@/lib/citation-read";
import { getSentimentQuotes } from "@/lib/postgres-read";
import { rollupReads } from "@/lib/rollup-read";

async function getBrandRow(brandId: string): Promise<AnalyticsBrandRow | undefined> {
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

async function getCompetitorRows(brandId: string): Promise<AnalyticsCompetitorRow[]> {
	return db
		.select({ id: competitors.id, name: competitors.name, domains: competitors.domains })
		.from(competitors)
		.where(eq(competitors.brandId, brandId))
		.orderBy(asc(competitors.createdAt), asc(competitors.id));
}

async function getPromptRows(brandId: string): Promise<AnalyticsPromptRow[]> {
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

export const pgReader: AnalyticsReader = {
	getBrandRow,
	getCompetitorRows,
	getPromptRows,
	getSentimentQuotes,
	...rollupReads(queryPg),
	...citationReads(queryPg),
};
