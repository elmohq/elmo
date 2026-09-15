export type ResearchTopic = "Citations" | "Engines" | "Tactics" | "Measurement";

export interface ResearchEntry {
	slug: string;
	topic: ResearchTopic;
}

export const RESEARCH_TOPICS: ResearchTopic[] = ["Citations", "Engines", "Tactics", "Measurement"];

export const researchEntries: ResearchEntry[] = [
	{ slug: "where-ai-citations-come-from", topic: "Citations" },
	{ slug: "citation-volatility", topic: "Citations" },
	{ slug: "ghost-citations", topic: "Citations" },
	{ slug: "how-long-to-get-cited-by-ai", topic: "Citations" },
	{ slug: "rankings-and-ai-citations", topic: "Citations" },
	{ slug: "can-you-trust-ai-citations", topic: "Citations" },
	{ slug: "can-content-scores-predict-ai-citations", topic: "Citations" },
	{ slug: "youtube-ai-citations", topic: "Engines" },
	{ slug: "reddit-ai-citations", topic: "Engines" },
	{ slug: "linkedin-ai-citations", topic: "Engines" },
	{ slug: "chatgpt-ui-reddit-citations-api", topic: "Engines" },
	{ slug: "openai-licensing-deals-chatgpt-citations", topic: "Engines" },
	{ slug: "ai-overviews-share-of-searches", topic: "Engines" },
	{ slug: "ai-search-fact-checking", topic: "Engines" },
	{ slug: "geo-detection", topic: "Tactics" },
	{ slug: "do-geo-tactics-stop-working", topic: "Tactics" },
	{ slug: "citation-wars", topic: "Tactics" },
	{ slug: "press-releases-ai-visibility", topic: "Tactics" },
	{ slug: "how-many-websites-block-ai-crawlers", topic: "Tactics" },
	{ slug: "why-ai-visibility-scores-differ", topic: "Measurement" },
	{ slug: "multi-turn-ai-search", topic: "Measurement" },
	{ slug: "ai-referral-traffic-conversion", topic: "Measurement" },
	{ slug: "microsoft-clarity-ai-citations", topic: "Measurement" },
	{ slug: "iab-ai-visibility-metrics", topic: "Measurement" },
];

export const researchSlugs = new Set(researchEntries.map((e) => e.slug));

export const TOPIC_BLURBS: Record<ResearchTopic, string> = {
	Citations:
		"Which sources answer engines actually cite, how fast those sources change, and what it takes to become one.",
	Engines:
		"How individual engines differ — what ChatGPT cites that Google does not, and why the same question returns different brands.",
	Tactics:
		"Whether the things people do to win AI visibility have measurable effects, including the ones that stop working.",
	Measurement:
		"What can and cannot be measured, where tools disagree, and which numbers survive contact with sampling noise.",
};
