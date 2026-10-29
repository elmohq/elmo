/**
 * The analytics server functions, answered in the browser whenever the brand's
 * data is already here, so a page or filter change needs no request. Until it
 * arrives each call goes to the server as before.
 */
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
import { brandDataStatus } from "@/lib/brand-data/sync";
import * as analysis from "@/server/analysis";
import * as citations from "@/server/citations";
import * as dashboard from "@/server/dashboard";
import * as prompts from "@/server/prompts";
import * as queryFanout from "@/server/query-fanout";
import * as visibility from "@/server/visibility";

type ServerFn<D, R> = (options: { data: D }) => Promise<R>;

function localFirst<D extends { brandId: string }, R>(
	part: "core" | "citations",
	server: ServerFn<D, R>,
	compute: (data: D) => Promise<R>,
): ServerFn<D, R> {
	return (options) => (brandDataStatus(options.data.brandId)[part] ? compute(options.data) : server(options));
}

export const getDashboardSummaryFn = localFirst("core", dashboard.getDashboardSummaryFn, computeDashboardSummary);
export const getShareOfVoiceFn = localFirst("core", analysis.getShareOfVoiceFn, computeShareOfVoice);
export const getCompetitiveLandscapeFn = localFirst("core", analysis.getCompetitiveLandscapeFn, computeLandscape);
export const getBrandSentimentFn = localFirst("core", analysis.getBrandSentimentFn, computeBrandSentiment);
export const getBatchChartDataFn = localFirst("core", visibility.getBatchChartDataFn, computeBatchChartData);
export const getFilteredVisibilityFn = localFirst(
	"core",
	visibility.getFilteredVisibilityFn,
	computeFilteredVisibility,
);
export const getPromptsSummaryFn = localFirst("core", prompts.getPromptsSummaryFn, computePromptsSummary);
export const getQueryFanoutFn = localFirst("core", queryFanout.getQueryFanoutFn, computeQueryFanout);
export const getCitationsFn = localFirst("citations", citations.getCitationsFn, computeCitations);
export const getCitationUrlsFn = localFirst("citations", citations.getCitationUrlsFn, computeCitationUrls);
export const getCitationDomainsFn = localFirst("citations", citations.getCitationDomainsFn, computeCitationDomains);
export const getGoogleShoppingFn = localFirst("citations", citations.getGoogleShoppingFn, computeGoogleShopping);
export const getCitationFlowFn = localFirst("citations", citations.getCitationFlowFn, computeCitationFlow);
