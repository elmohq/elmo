/**
 * The AI crawlers the crawler checker reports on. Pure data, safe to import from
 * client components — the checker renders this list before a check runs, and the
 * blog post at /blog/robots-txt-ai-crawlers documents the same set.
 */
export type CrawlerRole = "training" | "search" | "live" | "training-control";

export interface AiCrawler {
	/** robots.txt product token, matched case-insensitively. */
	token: string;
	operator: string;
	role: CrawlerRole;
	/** What the bot does, one short sentence. */
	purpose: string;
	/** What you give up by disallowing it. */
	blockingCosts: string;
}

export const CRAWLER_ROLE_LABELS: Record<CrawlerRole, string> = {
	training: "Model training",
	search: "Search index",
	live: "Live fetch",
	"training-control": "Training opt-out",
};

export const AI_CRAWLERS: AiCrawler[] = [
	{
		token: "GPTBot",
		operator: "OpenAI",
		role: "training",
		purpose: "Crawls pages to train models and improve OpenAI products.",
		blockingCosts: "Use of your content in OpenAI model training",
	},
	{
		token: "OAI-SearchBot",
		operator: "OpenAI",
		role: "search",
		purpose: "Indexes pages so ChatGPT search can cite them.",
		blockingCosts: "Citations in ChatGPT search",
	},
	{
		token: "ChatGPT-User",
		operator: "OpenAI",
		role: "live",
		purpose: "Fetches a page live when someone asks ChatGPT about it.",
		blockingCosts: "Live, user-prompted answers in ChatGPT",
	},
	{
		token: "PerplexityBot",
		operator: "Perplexity",
		role: "search",
		purpose: "Indexes pages for Perplexity answers.",
		blockingCosts: "Citations in Perplexity",
	},
	{
		token: "Perplexity-User",
		operator: "Perplexity",
		role: "live",
		purpose: "Fetches a page live for a specific Perplexity query.",
		blockingCosts: "Live answers in Perplexity",
	},
	{
		token: "ClaudeBot",
		operator: "Anthropic",
		role: "training",
		purpose: "Crawls for Claude training and retrieval.",
		blockingCosts: "Use of your content in Claude training and retrieval",
	},
	{
		token: "Claude-User",
		operator: "Anthropic",
		role: "live",
		purpose: "Fetches a page live for a Claude user request.",
		blockingCosts: "Live answers in Claude",
	},
	{
		token: "Googlebot",
		operator: "Google",
		role: "search",
		purpose: "Crawls for Google Search, including AI Overviews and AI Mode.",
		blockingCosts: "All of Google Search and Google's AI answers",
	},
	{
		token: "Google-Extended",
		operator: "Google",
		role: "training-control",
		purpose: "Controls use of your content for Gemini training and Vertex grounding.",
		blockingCosts: "Gemini training only — not Search or AI Overviews",
	},
	{
		token: "Bingbot",
		operator: "Microsoft",
		role: "search",
		purpose: "Crawls for Bing, which powers Microsoft Copilot.",
		blockingCosts: "Bing results and Copilot answers",
	},
	{
		token: "Amazonbot",
		operator: "Amazon",
		role: "training",
		purpose: "Crawls for Amazon services and AI.",
		blockingCosts: "Amazon AI surfaces",
	},
	{
		token: "Applebot-Extended",
		operator: "Apple",
		role: "training-control",
		purpose: "Controls use of your content for Apple Intelligence training.",
		blockingCosts: "Apple Intelligence training only",
	},
	{
		token: "Meta-ExternalAgent",
		operator: "Meta",
		role: "training",
		purpose: "Crawls for Meta's AI products.",
		blockingCosts: "Meta AI",
	},
	{
		token: "CCBot",
		operator: "Common Crawl",
		role: "training",
		purpose: "Crawls for an open dataset many model makers train on.",
		blockingCosts: "A wide range of third-party training sets",
	},
];
