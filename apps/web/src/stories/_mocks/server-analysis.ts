/**
 * Share of Voice data for Storybook stories, which the brand-data client mock
 * answers with. Stories set it via setMockShareOfVoice() and friends.
 */
import type { ShareOfVoiceResponse } from "@/lib/analytics/pages/analysis";
import type { Landscape } from "@/lib/landscape";
import type { BrandSentiment } from "@/server/analytics-core";

export type { ShareOfVoiceResponse } from "@/lib/analytics/pages/analysis";

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
