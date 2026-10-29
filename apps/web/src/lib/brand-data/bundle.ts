/** Rows stay at the rollups' quarter-hour grain so the viewer's timezone decides day boundaries, as on the server. */

export interface RunKeyColumns {
	/** Minutes since the Unix epoch. */
	bucket: number[];
	/** Index into `prompts`. */
	prompt: number[];
	/** Index into `dicts.models`. */
	model: number[];
	/** Index into `dicts.providers`. */
	provider: number[];
	/** 1 when the run searched the web. */
	web: number[];
}

export interface PromptRunColumns extends RunKeyColumns {
	runs: number[];
	brandMentioned: number[];
	competitorRuns: number[];
	competitorMentions: number[];
	noMention: number[];
	fanoutRuns: number[];
	fanoutQueries: number[];
	/** Milliseconds since the Unix epoch. */
	firstRunAt: number[];
	lastRunAt: number[];
	positive: number[];
	neutral: number[];
	negative: number[];
	mixed: number[];
	positionSum: number[];
	positioned: number[];
}

export interface CompetitorMentionColumns extends RunKeyColumns {
	/** Index into `dicts.competitors`. */
	competitor: number[];
	runs: number[];
	positive: number[];
	neutral: number[];
	negative: number[];
	mixed: number[];
	positionSum: number[];
	positioned: number[];
}

export interface WebQueryColumns extends RunKeyColumns {
	/** Index into `dicts.queries`. */
	query: number[];
	runs: number[];
	brandMentioned: number[];
}

export interface CitationColumns extends RunKeyColumns {
	/** Index into `pages`. */
	page: number[];
	citations: number[];
	positionSum: number[];
}

export interface CitationPageColumns {
	id: number[];
	url: string[];
	/** Index into `dicts.domains`. */
	domain: number[];
	title: (string | null)[];
	/** Index into `dicts.pageTypes`. */
	pageType: number[];
	/** Index into `dicts.categories`. */
	category: number[];
}

export interface SentimentQuoteColumns extends RunKeyColumns {
	sentiment: number[];
	runId: string[];
	confidence: number[];
	/** Milliseconds since the Unix epoch. */
	createdAt: number[];
}

export interface BundleBrand {
	id: string;
	name: string;
	website: string;
	additionalDomains: string[];
	delayOverrideHours: number | null;
}

export interface BundleCompetitor {
	id: string;
	name: string;
	domains: string[];
}

export interface BundlePrompt {
	id: string;
	value: string;
	tags: string[];
	systemTags: string[];
	enabled: boolean;
	createdAt: string;
}

export interface BrandBundle {
	brandId: string;
	version: string;
	/** Providers that call a model's API directly, which the model filter tells apart. */
	apiProviderIds: string[];
	brand: BundleBrand;
	competitors: BundleCompetitor[];
	prompts: BundlePrompt[];
	dicts: {
		models: string[];
		providers: string[];
		competitors: string[];
		queries: string[];
		domains: string[];
		pageTypes: string[];
		categories: string[];
		sentiments: string[];
	};
	promptRuns: PromptRunColumns;
	competitorMentions: CompetitorMentionColumns;
	webQueries: WebQueryColumns;
	citations: CitationColumns;
	citationPages: CitationPageColumns;
	sentimentQuotes: SentimentQuoteColumns;
}
