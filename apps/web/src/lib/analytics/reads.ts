/**
 * The one place analytics code reads from. On the server that is Postgres; in
 * the browser it is the brand's in-memory copy, so the same functions compute
 * the same numbers on either side without a request.
 */
import { createIsomorphicFn } from "@tanstack/react-start";

type PgReads = typeof import("@/lib/analytics/pg-reads");

const implementation = createIsomorphicFn()
	.server((): Promise<PgReads> => import("@/lib/analytics/pg-reads"))
	.client((): Promise<PgReads> => import("@/lib/analytics/memory-all-reads") as unknown as Promise<PgReads>);

function read<K extends keyof PgReads>(name: K): PgReads[K] {
	return (async (...args: unknown[]) => {
		const reads = await implementation();
		return (reads[name] as (...a: unknown[]) => unknown)(...args);
	}) as PgReads[K];
}

export const getBrandRow = read("getBrandRow");
export const getCompetitorRows = read("getCompetitorRows");
export const getPromptRows = read("getPromptRows");
export const getSentimentQuotes = read("getSentimentQuotes");
export const getCitationDomainPage = read("getCitationDomainPage");
export const getCitationFlowRows = read("getCitationFlowRows");
export const getCitationSummary = read("getCitationSummary");
export const getCitationTotals = read("getCitationTotals");
export const getCitationUrlPage = read("getCitationUrlPage");
export const getDomainPromptCounts = read("getDomainPromptCounts");
export const getBrandEarliestRunDate = read("getBrandEarliestRunDate");
export const getCitationsCountByModel = read("getCitationsCountByModel");
export const getCitationTotal = read("getCitationTotal");
export const getCitationUrlStats = read("getCitationUrlStats");
export const getCompetitorTotals = read("getCompetitorTotals");
export const getDailyAssessments = read("getDailyAssessments");
export const getFanoutBreakdown = read("getFanoutBreakdown");
export const getFanoutModelTotals = read("getFanoutModelTotals");
export const getFanoutPromptTotals = read("getFanoutPromptTotals");
export const getFanoutQueryPage = read("getFanoutQueryPage");
export const getFanoutQueryTotals = read("getFanoutQueryTotals");
export const getMentionTotals = read("getMentionTotals");
export const getPerPromptCitationDomains = read("getPerPromptCitationDomains");
export const getPerPromptCitationPages = read("getPerPromptCitationPages");
export const getPerPromptDailyCitationClasses = read("getPerPromptDailyCitationClasses");
export const getPerPromptDailyCitationDomains = read("getPerPromptDailyCitationDomains");
export const getPerPromptDailyCompetitors = read("getPerPromptDailyCompetitors");
export const getPerPromptDailyRuns = read("getPerPromptDailyRuns");
export const getPerPromptGooglePages = read("getPerPromptGooglePages");
export const getPerPromptRunStats = read("getPerPromptRunStats");
export const getPromptModelDailyCompetitors = read("getPromptModelDailyCompetitors");
export const getPromptModelDailyRuns = read("getPromptModelDailyRuns");
export const getPromptsFirstEvaluatedAt = read("getPromptsFirstEvaluatedAt");
export const getRunsByModel = read("getRunsByModel");
export const getVisibilityDailyAggregate = read("getVisibilityDailyAggregate");
