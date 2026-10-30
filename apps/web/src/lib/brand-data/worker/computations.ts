import { computeBrandSentiment, computeLandscape, computeShareOfVoice } from "@/lib/analytics/pages/analysis";
import {
	computeCitationDomains,
	computeCitationFlow,
	computeCitations,
	computeCitationUrls,
	computeGoogleShopping,
} from "@/lib/analytics/pages/citations";
import { computeDashboardSummary } from "@/lib/analytics/pages/dashboard";
import { computePromptsSummary } from "@/lib/analytics/pages/prompts-summary";
import { computeQueryFanout } from "@/lib/analytics/pages/query-fanout";
import { computeBatchChartData, computeFilteredVisibility } from "@/lib/analytics/pages/visibility";
import type { AnalyticsReader } from "@/lib/analytics/reader";

type Computation = (reader: AnalyticsReader, input: never) => Promise<unknown>;

export const computations = {
	dashboardSummary: computeDashboardSummary,
	shareOfVoice: computeShareOfVoice,
	landscape: computeLandscape,
	brandSentiment: computeBrandSentiment,
	batchChartData: computeBatchChartData,
	filteredVisibility: computeFilteredVisibility,
	promptsSummary: computePromptsSummary,
	queryFanout: computeQueryFanout,
	citations: computeCitations,
	citationUrls: computeCitationUrls,
	citationDomains: computeCitationDomains,
	googleShopping: computeGoogleShopping,
	citationFlow: computeCitationFlow,
} satisfies Record<string, Computation>;
