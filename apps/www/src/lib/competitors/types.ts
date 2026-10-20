export type FeatureKey =
	| "multiLlmTracking"
	| "chatgpt"
	| "googleAiOverviews"
	| "googleAiMode"
	| "gemini"
	| "perplexity"
	| "copilot"
	| "claude"
	| "grok"
	| "deepseek"
	| "metaAi"
	| "anyModel"
	| "uiCapture"
	| "byoKeys"
	| "visibilityScore"
	| "citationAnalytics"
	| "competitorBenchmarking"
	| "brandMentionTracking"
	| "promptVolumeEstimates"
	| "sentimentAnalysis"
	| "queryFanOut"
	| "crawlerAnalytics"
	| "geographicTracking"
	| "socialMediaTracking"
	| "shoppingTracking"
	| "multiLanguage"
	| "actionRecommendations"
	| "contentGapAnalysis"
	| "siteAudits"
	| "keywordResearch"
	| "emailAlerts"
	| "dataExportApi"
	| "typescriptSdk"
	| "pythonSdk"
	| "mcpServer"
	| "biConnectors"
	| "whiteLabelAgency"
	| "openSource"
	| "contentGeneration";

export type CompetitorCategory =
	| "tracking"
	| "content"
	| "api-developer"
	| "ecommerce"
	| "seo-traditional"
	| "open-source"
	| "other";

interface FeatureDefinition {
	label: string;
	description: string;
	searchTerm?: string;
	/** Mid-sentence phrasing, for labels whose proper nouns must keep their case. */
	phrase?: string;
}

export interface FeatureCategory {
	label: string;
	features: Record<string, FeatureDefinition>;
}

export interface Competitor {
	slug: string;
	name: string;
	domain: string;
	url: string;
	tagline: string;
	description: string;
	category: CompetitorCategory;
	ahrefsDR: number;
	ahrefsTraffic?: number;
	status: "active" | "beta" | "acquired" | "shutting-down" | "defunct" | "pivoted";
	/** What happened to a tool that shut down, pivoted, or was acquired. Shown in the AEO Graveyard. */
	fate?: { date: string; summary: string; source?: string };
	/** Set when the screenshot is mostly dark, so the graveyard inverts it to read as engraved. */
	darkScreenshot?: true;
	/** Set when no usable capture of the tool's site exists, so pages skip the screenshot. */
	noScreenshot?: true;
	/** SPDX identifier of the open-source license, for tools whose code is public. */
	license?: string;
	/**
	 * The one-line reason to pick Elmo over this tool, shown up top on the
	 * comparison page. Hand-written for tools where the generated one would miss
	 * the real difference; keep it fair and checkable.
	 */
	soundbite?: string;
	features: Partial<Record<FeatureKey, boolean>>;
	pricing?: {
		hasFree: boolean;
		startingPrice?: string;
		hasEnterprise: boolean;
	};
	highlights?: string[];
	notes?: string;
	/**
	 * Why people tell us they leave this tool, and what Elmo does about it.
	 * Hand-written and set only for the handful of tools with real "alternatives"
	 * search demand — everything else falls back to the generated copy. Frame
	 * `reasons` as reported user sentiment, not as claims of fact about a rival.
	 */
	switching?: {
		reasons: { headline: string; detail: string; elmo: string }[];
	};
}

export const FEATURE_CATEGORIES: Record<string, FeatureCategory> = {
	core: {
		label: "Core Tracking",
		features: {
			multiLlmTracking: {
				label: "Multi-LLM Tracking",
				description: "Track across ChatGPT, Claude, Gemini, Perplexity, and more",
				searchTerm: "LLM Trackers",
			},
			visibilityScore: {
				label: "AI Visibility Score",
				description: "Aggregate score showing brand presence across AI responses",
				searchTerm: "AI Visibility Score Tools",
			},
			citationAnalytics: {
				label: "Citation Analytics",
				description: "Track which websites and sources are cited in AI responses",
				searchTerm: "AI Citation Tracking Tools",
			},
			competitorBenchmarking: {
				label: "Competitor Benchmarking",
				description: "Compare visibility against competitors for each prompt",
				searchTerm: "AI Share of Voice Tools",
			},
			brandMentionTracking: {
				label: "Brand Mention Tracking",
				description: "Monitor when and how AI platforms mention your brand",
				searchTerm: "AI Search Monitoring Tools",
			},
		},
	},
	engines: {
		label: "AI Engines",
		features: {
			chatgpt: {
				label: "ChatGPT",
				description: "Track answers from OpenAI's ChatGPT",
				searchTerm: "ChatGPT Rank Trackers",
				phrase: "ChatGPT tracking",
			},
			googleAiOverviews: {
				label: "Google AI Overviews",
				description: "Track the AI Overviews shown above Google search results",
				searchTerm: "AI Overview Trackers",
				phrase: "Google AI Overviews tracking",
			},
			googleAiMode: {
				label: "Google AI Mode",
				description: "Track answers from Google's conversational AI Mode",
				searchTerm: "Google AI Mode Trackers",
				phrase: "Google AI Mode tracking",
			},
			gemini: {
				label: "Gemini",
				description: "Track answers from Google's Gemini app",
				searchTerm: "Gemini Visibility Trackers",
				phrase: "Gemini tracking",
			},
			perplexity: {
				label: "Perplexity",
				description: "Track answers from Perplexity",
				searchTerm: "Perplexity Rank Trackers",
				phrase: "Perplexity tracking",
			},
			copilot: {
				label: "Microsoft Copilot",
				description: "Track answers from Microsoft Copilot",
				searchTerm: "Copilot Visibility Trackers",
				phrase: "Microsoft Copilot tracking",
			},
			claude: {
				label: "Claude",
				description: "Track answers from Anthropic's Claude",
				searchTerm: "Claude Visibility Trackers",
				phrase: "Claude tracking",
			},
			grok: {
				label: "Grok",
				description: "Track answers from xAI's Grok",
				searchTerm: "Grok Visibility Trackers",
				phrase: "Grok tracking",
			},
			deepseek: {
				label: "DeepSeek",
				description: "Track answers from DeepSeek",
				searchTerm: "DeepSeek Visibility Trackers",
				phrase: "DeepSeek tracking",
			},
			metaAi: {
				label: "Meta AI",
				description: "Track answers from Meta AI",
				searchTerm: "Meta AI Visibility Trackers",
				phrase: "Meta AI tracking",
			},
			anyModel: {
				label: "Any Model",
				description: "Add models beyond a fixed list, such as any model available through OpenRouter",
				phrase: "tracking for any model",
			},
			uiCapture: {
				label: "Real UI Answers",
				description: "Capture answers from the consumer apps people use, not only from model APIs",
				phrase: "answers captured from the real consumer apps",
			},
			byoKeys: {
				label: "Bring Your Own Keys",
				description: "Plug in your own scraper and model API accounts and pay providers directly",
				phrase: "bring-your-own-key support",
			},
		},
	},
	platform: {
		label: "Platform",
		features: {
			whiteLabelAgency: {
				label: "White-Label / Agency",
				description: "Multi-client dashboards and custom branding",
				searchTerm: "White-Label AI Visibility Tools",
			},
			openSource: {
				label: "Open Source",
				description: "Source code available for self-hosting",
				searchTerm: "Open Source AI Visibility Tools",
			},
			contentGeneration: {
				label: "Content Generation",
				description: "AI-powered content creation and optimization",
			},
		},
	},
	advanced: {
		label: "Advanced Analytics",
		features: {
			promptVolumeEstimates: {
				label: "Prompt Volume Estimates",
				description: "Estimated search volumes for tracked queries",
			},
			sentimentAnalysis: {
				label: "Sentiment Analysis",
				description: "Track brand perception across AI platforms",
				searchTerm: "AI Brand Sentiment Tools",
			},
			queryFanOut: {
				label: "Query Fan-Out",
				description: "See the web searches AI engines run behind each answer",
				searchTerm: "Query Fan-Out Tools",
			},
			crawlerAnalytics: {
				label: "AI Crawler Analytics",
				description: "Track AI bot visits to your website",
				searchTerm: "AI Crawler Analytics Tools",
			},
			geographicTracking: {
				label: "Geographic Tracking",
				description: "Track AI visibility by region or country",
			},
			socialMediaTracking: {
				label: "Social Media Tracking",
				description: "Monitor brand mentions on Reddit and social platforms",
			},
			shoppingTracking: {
				label: "Shopping Tracking",
				description: "Monitor product visibility in AI shopping features",
			},
			multiLanguage: {
				label: "Multi-Language",
				description: "Track visibility across multiple languages",
			},
		},
	},
	insights: {
		label: "Actionable Insights",
		features: {
			actionRecommendations: {
				label: "Action Recommendations",
				description: "Prioritized action items based on visibility gaps",
			},
			contentGapAnalysis: {
				label: "Content Gap Analysis",
				description: "Detect content gaps where competitors are cited but you aren't",
			},
			siteAudits: {
				label: "AI Site Audits",
				description: "Assess how AI-friendly your site content is",
			},
			keywordResearch: {
				label: "AI Keyword Research",
				description: "Discover conversational prompts users ask on AI platforms",
				searchTerm: "AI Keyword Research Tools",
			},
		},
	},
	reporting: {
		label: "Reporting & Integration",
		features: {
			emailAlerts: {
				label: "Email Alerts",
				description: "Automated alerts and summary emails",
			},
			dataExportApi: {
				label: "API Access",
				description: "Export data to CSV or access via API",
				searchTerm: "AI Visibility APIs",
			},
			typescriptSdk: {
				label: "TypeScript SDK",
				description: "Official TypeScript/JavaScript client for the API",
			},
			pythonSdk: {
				label: "Python SDK",
				description: "Official Python client for the API",
			},
			mcpServer: {
				label: "MCP Access",
				description: "Query visibility data from AI assistants like Claude, ChatGPT, and Cursor",
				searchTerm: "AI Visibility MCP Servers",
			},
			biConnectors: {
				label: "BI Connectors",
				description: "Native connectors to Looker Studio, NinjaCat, and other BI tools",
			},
		},
	},
};

export function getFeatureLabel(key: FeatureKey): string {
	for (const cat of Object.values(FEATURE_CATEGORIES)) {
		if (key in cat.features) return cat.features[key].label;
	}
	return key;
}

export function getFeatureSearchTerm(key: FeatureKey): string | undefined {
	for (const cat of Object.values(FEATURE_CATEGORIES)) {
		if (key in cat.features) return cat.features[key].searchTerm;
	}
	return undefined;
}

export function getFeaturePhrase(key: FeatureKey): string | undefined {
	for (const cat of Object.values(FEATURE_CATEGORIES)) {
		if (key in cat.features) return cat.features[key].phrase;
	}
	return undefined;
}

export function getFeatureDescription(key: FeatureKey): string {
	for (const cat of Object.values(FEATURE_CATEGORIES)) {
		if (key in cat.features) return cat.features[key].description;
	}
	return "";
}

export const ELMO_FEATURES: Record<FeatureKey, boolean> = {
	multiLlmTracking: true,
	chatgpt: true,
	googleAiOverviews: true,
	googleAiMode: true,
	gemini: true,
	perplexity: true,
	copilot: true,
	claude: true,
	grok: true,
	deepseek: true,
	metaAi: true,
	anyModel: true,
	uiCapture: true,
	byoKeys: true,
	visibilityScore: true,
	citationAnalytics: true,
	competitorBenchmarking: true,
	brandMentionTracking: true,
	promptVolumeEstimates: false,
	sentimentAnalysis: true,
	queryFanOut: true,
	crawlerAnalytics: false,
	geographicTracking: false,
	socialMediaTracking: false,
	shoppingTracking: false,
	multiLanguage: false,
	actionRecommendations: true,
	contentGapAnalysis: true,
	siteAudits: false,
	keywordResearch: true,
	emailAlerts: false,
	dataExportApi: true,
	typescriptSdk: true,
	pythonSdk: true,
	mcpServer: true,
	biConnectors: false,
	whiteLabelAgency: true,
	openSource: true,
	contentGeneration: false,
};

export const CATEGORY_LABELS: Record<CompetitorCategory, string> = {
	tracking: "AI Visibility Tracking",
	content: "Content Generation",
	"api-developer": "API",
	ecommerce: "E-commerce",
	"seo-traditional": "Traditional SEO",
	"open-source": "Open Source",
	other: "Other",
};

const LOW_DR_THRESHOLD = 25;

/** Tools that no longer exist as AI visibility products. */
export function isRetired(competitor: Competitor): boolean {
	return competitor.status === "shutting-down" || competitor.status === "defunct" || competitor.status === "pivoted";
}

export function isLowDR(competitor: Competitor): boolean {
	return competitor.ahrefsDR < LOW_DR_THRESHOLD;
}

export function getScreenshotUrl(slug: string): string {
	return `https://nynjceth7hnajxhe.public.blob.vercel-storage.com/screenshots/${slug}.jpg`;
}
