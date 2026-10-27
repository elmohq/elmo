import type { AiCrawler, CrawlerAccess } from "./robots";

export interface Source {
	url: string;
	domain: string;
	title?: string;
}

export interface PromptResult {
	prompt: string;
	mentioned: boolean;
	position: number | null;
	competitors: string[];
	cited: boolean;
	sources: Source[];
	failed?: boolean;
}

export interface SiteSignals {
	homepageReachable: boolean;
	title: string;
	description: string;
	structuredDataTypes: string[];
	robotsTxt: "found" | "missing" | "unreachable";
	llmsTxt: boolean;
	crawlers: (AiCrawler & { access: CrawlerAccess })[];
}

export interface ScoreItem {
	key: "mentions" | "position" | "citations" | "crawlers" | "structured-data" | "llms-txt";
	label: string;
	points: number;
	max: number;
	detail: string;
}

export interface CheckResult {
	domain: string;
	brandName: string;
	category: string;
	engine: string;
	checkedAt: string;
	prompts: PromptResult[];
	recommendedInstead: { name: string; count: number }[];
	topSources: { domain: string; count: number }[];
	site: SiteSignals;
	score: { total: number; items: ScoreItem[] };
	sample?: boolean;
}

export type CheckEvent =
	| { type: "stage"; stage: "site" | "prompts" | "answers" | "analysis" }
	| { type: "prompts"; brandName: string; category: string; prompts: string[] }
	| { type: "answer"; index: number }
	| { type: "result"; result: CheckResult; cached: boolean }
	| { type: "error"; message: string };
