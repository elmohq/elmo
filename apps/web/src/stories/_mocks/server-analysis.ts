/**
 * Mock for @/server/analysis used in Storybook stories. The real module imports
 * pg via the postgres read layer, which is not browser-safe. The types come
 * from it all the same — `import type` is erased before Storybook's alias
 * redirects the module, so a story can't drift from the real response shape.
 *
 * Stories set data via setMockShareOfVoice(); the real useShareOfVoice hook calls
 * this through react-query. (Opportunities now live in @/server/opportunities.)
 */
import type { Landscape } from "@/lib/landscape";
import type { ShareOfVoiceResponse } from "@/server/analysis";
import type { BrandSentiment } from "@/server/analytics-core";

export type { ShareOfVoiceResponse } from "@/server/analysis";

let _sov: ShareOfVoiceResponse | null = null;

export function setMockShareOfVoice(data: ShareOfVoiceResponse) {
	_sov = data;
}

export const getShareOfVoiceFn = async (..._args: unknown[]) => _sov;

let _landscape: Landscape | null = null;

export function setMockLandscape(data: Landscape) {
	_landscape = data;
}

export const getCompetitiveLandscapeFn = async (..._args: unknown[]) => _landscape;

let _sentiment: BrandSentiment | null = null;

export function setMockBrandSentiment(data: BrandSentiment) {
	_sentiment = data;
}

export const getBrandSentimentFn = async (..._args: unknown[]) => _sentiment;
