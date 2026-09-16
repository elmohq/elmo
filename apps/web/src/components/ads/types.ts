/**
 * What the Ads page reads. This is the contract `server/ads.ts` will satisfy —
 * every field is a grouped aggregate over `ad_impressions` (plus one count over
 * `prompt_runs` for the denominator), rolled up in memory the way
 * `citation-rollup.ts` does, so a worker-maintained rollup table can replace the
 * queries underneath without touching a component.
 */

/** How an advertiser relates to the brand, on the same rules the Citations page
 *  uses (`categorizeDomain` against the brand's and competitors' domains). */
export type AdAttribution = "brand" | "competitor" | "other";

export interface AdPromptRef {
	id: string;
	value: string;
	count: number;
}

export interface AdAdvertiser {
	/** Registrable host of the advertiser's site — the competitor join key. */
	domain: string;
	/** Verified advertiser name the surface reports ("SEOSpace, LLC"). */
	name: string;
	attribution: AdAttribution;
	/** Set when `attribution` is "competitor" — the tracked competitor's own name. */
	competitorName?: string;
	impressions: number;
	promptCount: number;
	/** Share of all ad impressions in the window, already rounded. */
	sharePercent: number;
	previousImpressions: number;
	firstSeen: string;
	lastSeen: string;
	/** Organic citations to the same domain in the same window. Powers the
	 *  paid-vs-earned split; 0 means they only ever appear by buying. */
	citedCount: number;
	prompts: AdPromptRef[];
}

export interface AdCreative {
	id: string;
	advertiserDomain: string;
	advertiserName: string;
	attribution: AdAttribution;
	competitorName?: string;
	headline: string;
	body: string;
	imageUrl?: string | null;
	targetUrl?: string | null;
	impressions: number;
	firstSeen: string;
	lastSeen: string;
	prompts: AdPromptRef[];
}

export interface AdPrompt {
	id: string;
	value: string;
	impressions: number;
	/** Runs of this prompt that *could* have carried an ad — scraped surfaces
	 *  only. An API-routed run never shows one and would dilute the rate. */
	eligibleRuns: number;
	/** impressions / eligibleRuns, as a percentage. */
	adRate: number;
	advertisers: {
		domain: string;
		name: string;
		attribution: AdAttribution;
		competitorName?: string;
		count: number;
	}[];
}

export interface AdMovementEntry {
	domain: string;
	name: string;
	attribution: AdAttribution;
	competitorName?: string;
	impressions: number;
	previousImpressions: number;
}

export interface AdsData {
	totalImpressions: number;
	eligibleRuns: number;
	/** Share of eligible answers that carried an ad. */
	adRate: number;
	uniqueAdvertisers: number;
	competitorSharePercent: number;
	brandImpressions: number;
	advertisers: AdAdvertiser[];
	creatives: AdCreative[];
	prompts: AdPrompt[];
	/** Daily ad rate, split by attribution. The three bands sum to `adRate`. */
	timeSeries: { date: string; adRate: number; brand: number; competitor: number; other: number }[];
	movement: { entered: AdMovementEntry[]; left: AdMovementEntry[] };
	competitors: { id: string; name: string; domains: string[] }[];
}
