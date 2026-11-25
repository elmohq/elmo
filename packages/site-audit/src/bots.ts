export interface Bot {
	token: string;
	userAgent: string;
}

export const AI_SEARCH_CRAWLERS = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"];

export const AI_USER_AGENTS = ["ChatGPT-User", "Claude-User", "Perplexity-User"];

export const AI_TRAINING_CRAWLERS = ["GPTBot", "ClaudeBot", "Google-Extended", "CCBot"];

export const PROBE_BOTS: Bot[] = [
	{
		token: "ChatGPT-User",
		userAgent:
			"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
	},
	{
		token: "OAI-SearchBot",
		userAgent:
			"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot",
	},
	{
		token: "Claude-User",
		userAgent:
			"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)",
	},
	{
		token: "PerplexityBot",
		userAgent:
			"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
	},
];
