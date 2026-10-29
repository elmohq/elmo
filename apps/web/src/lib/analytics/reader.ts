import type { AnalyticsBrandRow, AnalyticsCompetitorRow, AnalyticsPromptRow } from "@/lib/analytics/entities";
import type * as citationRead from "@/lib/citation-read";
import type * as postgresRead from "@/lib/postgres-read";
import type * as rollupRead from "@/lib/rollup-read";

/** Everything the analytics read: Postgres on the server, the brand's synced data in the browser. */
export interface AnalyticsReader {
	getBrandRow(brandId: string): Promise<AnalyticsBrandRow | undefined>;
	getCompetitorRows(brandId: string): Promise<AnalyticsCompetitorRow[]>;
	/** Newest first, as the prompt list shows them. */
	getPromptRows(brandId: string): Promise<AnalyticsPromptRow[]>;
	getSentimentQuotes: typeof postgresRead.getSentimentQuotes;
	getCitationDomainPage: typeof citationRead.getCitationDomainPage;
	getCitationFlowRows: typeof citationRead.getCitationFlowRows;
	getCitationSummary: typeof citationRead.getCitationSummary;
	getCitationTotals: typeof citationRead.getCitationTotals;
	getCitationUrlPage: typeof citationRead.getCitationUrlPage;
	getDomainPromptCounts: typeof citationRead.getDomainPromptCounts;
	getBrandEarliestRunDate: typeof rollupRead.getBrandEarliestRunDate;
	getCitationsCountByModel: typeof rollupRead.getCitationsCountByModel;
	getCitationTotal: typeof rollupRead.getCitationTotal;
	getCitationUrlStats: typeof rollupRead.getCitationUrlStats;
	getCompetitorTotals: typeof rollupRead.getCompetitorTotals;
	getDailyAssessments: typeof rollupRead.getDailyAssessments;
	getFanoutBreakdown: typeof rollupRead.getFanoutBreakdown;
	getFanoutModelTotals: typeof rollupRead.getFanoutModelTotals;
	getFanoutPromptTotals: typeof rollupRead.getFanoutPromptTotals;
	getFanoutQueryPage: typeof rollupRead.getFanoutQueryPage;
	getFanoutQueryTotals: typeof rollupRead.getFanoutQueryTotals;
	getMentionTotals: typeof rollupRead.getMentionTotals;
	getPerPromptCitationDomains: typeof rollupRead.getPerPromptCitationDomains;
	getPerPromptCitationPages: typeof rollupRead.getPerPromptCitationPages;
	getPerPromptDailyCitationClasses: typeof rollupRead.getPerPromptDailyCitationClasses;
	getPerPromptDailyCitationDomains: typeof rollupRead.getPerPromptDailyCitationDomains;
	getPerPromptDailyCompetitors: typeof rollupRead.getPerPromptDailyCompetitors;
	getPerPromptDailyRuns: typeof rollupRead.getPerPromptDailyRuns;
	getPerPromptGooglePages: typeof rollupRead.getPerPromptGooglePages;
	getPerPromptRunStats: typeof rollupRead.getPerPromptRunStats;
	getPromptModelDailyCompetitors: typeof rollupRead.getPromptModelDailyCompetitors;
	getPromptModelDailyRuns: typeof rollupRead.getPromptModelDailyRuns;
	getPromptsFirstEvaluatedAt: typeof rollupRead.getPromptsFirstEvaluatedAt;
	getRunsByModel: typeof rollupRead.getRunsByModel;
	getVisibilityDailyAggregate: typeof rollupRead.getVisibilityDailyAggregate;
}
