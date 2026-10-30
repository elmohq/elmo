import type { AnalyticsBrandRow, AnalyticsCompetitorRow, AnalyticsPromptRow } from "@/lib/analytics/entities";
import type { citationReads } from "@/lib/citation-read";
import type * as postgresRead from "@/lib/postgres-read";
import type { rollupReads } from "@/lib/rollup-read";

export interface AnalyticsEntityReads {
	getBrandRow(brandId: string): Promise<AnalyticsBrandRow | undefined>;
	getCompetitorRows(brandId: string): Promise<AnalyticsCompetitorRow[]>;
	/** Newest first, as the prompt list shows them. */
	getPromptRows(brandId: string): Promise<AnalyticsPromptRow[]>;
	getSentimentQuotes: typeof postgresRead.getSentimentQuotes;
}

export type AnalyticsReader = AnalyticsEntityReads & ReturnType<typeof rollupReads> & ReturnType<typeof citationReads>;
