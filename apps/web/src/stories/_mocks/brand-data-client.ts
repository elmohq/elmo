/** Mock for @/lib/brand-data/client used in Storybook stories: answers with the data the stories set. */
import { getBrandSentimentFn, getCompetitiveLandscapeFn, getShareOfVoiceFn } from "./server-analysis";
import {
	getCitationDomainsFn,
	getCitationFlowFn,
	getCitationsFn,
	getCitationUrlsFn,
	getGoogleShoppingFn,
} from "./server-citations";
import { getDashboardSummaryFn } from "./server-dashboard";
import { getQueryFanoutFn } from "./server-query-fanout";

type Answer = (options: { data: never }) => Promise<unknown>;

const answers: Record<string, Answer> = {
	dashboardSummary: getDashboardSummaryFn,
	shareOfVoice: getShareOfVoiceFn,
	landscape: getCompetitiveLandscapeFn,
	brandSentiment: getBrandSentimentFn,
	queryFanout: getQueryFanoutFn,
	citations: getCitationsFn,
	citationUrls: getCitationUrlsFn,
	citationDomains: getCitationDomainsFn,
	googleShopping: getGoogleShoppingFn,
	citationFlow: getCitationFlowFn,
};

export const brandDataQuery = { meta: { brandData: true }, staleTime: 5 * 60_000 } as const;
export const computeBrandData = async (name: string, input: unknown) =>
	(await answers[name]?.({ data: input as never })) ?? null;
export const syncBrandData = (_brandId: string) => {};
export const onBrandDataChange = (_listener: unknown) => () => {};
export const clearBrandData = async () => {};
