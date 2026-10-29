import { canComputeLocally, computeLocally } from "@/lib/brand-data/client";
import type { LocalComputation } from "@/lib/brand-data/worker/protocol";
import * as analysis from "@/server/analysis";
import * as citations from "@/server/citations";
import * as dashboard from "@/server/dashboard";
import * as prompts from "@/server/prompts";
import * as queryFanout from "@/server/query-fanout";
import * as visibility from "@/server/visibility";

type ServerFn<D, R> = (options: { data: D }) => Promise<R>;

/** Answers in the browser once the brand's data has synced; until then, and if that fails, asks the server. */
function localFirst<D extends { brandId: string }, R>(name: LocalComputation, server: ServerFn<D, R>): ServerFn<D, R> {
	return async (options) => {
		if (!canComputeLocally(options.data.brandId, name)) return server(options);
		try {
			return await computeLocally<R>(options.data.brandId, name, options.data);
		} catch {
			return server(options);
		}
	};
}

export const getDashboardSummaryFn = localFirst("dashboardSummary", dashboard.getDashboardSummaryFn);
export const getShareOfVoiceFn = localFirst("shareOfVoice", analysis.getShareOfVoiceFn);
export const getCompetitiveLandscapeFn = localFirst("landscape", analysis.getCompetitiveLandscapeFn);
export const getBrandSentimentFn = localFirst("brandSentiment", analysis.getBrandSentimentFn);
export const getBatchChartDataFn = localFirst("batchChartData", visibility.getBatchChartDataFn);
export const getFilteredVisibilityFn = localFirst("filteredVisibility", visibility.getFilteredVisibilityFn);
export const getPromptsSummaryFn = localFirst("promptsSummary", prompts.getPromptsSummaryFn);
export const getQueryFanoutFn = localFirst("queryFanout", queryFanout.getQueryFanoutFn);
export const getCitationsFn = localFirst("citations", citations.getCitationsFn);
export const getCitationUrlsFn = localFirst("citationUrls", citations.getCitationUrlsFn);
export const getCitationDomainsFn = localFirst("citationDomains", citations.getCitationDomainsFn);
export const getGoogleShoppingFn = localFirst("googleShopping", citations.getGoogleShoppingFn);
export const getCitationFlowFn = localFirst("citationFlow", citations.getCitationFlowFn);
