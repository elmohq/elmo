export interface AiCrawler {
	token: string;
	owner: string;
	kind: "search" | "training";
	purpose: string;
}

export const AI_CRAWLERS: AiCrawler[] = [
	{ token: "OAI-SearchBot", owner: "OpenAI", kind: "search", purpose: "Indexes pages for ChatGPT search results" },
	{ token: "ChatGPT-User", owner: "OpenAI", kind: "search", purpose: "Fetches pages when a ChatGPT user asks" },
	{ token: "GPTBot", owner: "OpenAI", kind: "training", purpose: "Collects training data for OpenAI models" },
	{ token: "Claude-SearchBot", owner: "Anthropic", kind: "search", purpose: "Indexes pages for Claude's web search" },
	{ token: "ClaudeBot", owner: "Anthropic", kind: "training", purpose: "Collects training data for Claude" },
	{ token: "PerplexityBot", owner: "Perplexity", kind: "search", purpose: "Indexes pages for Perplexity answers" },
	{
		token: "Google-Extended",
		owner: "Google",
		kind: "training",
		purpose: "Controls use of your content for Gemini training and grounding",
	},
	{
		token: "Applebot-Extended",
		owner: "Apple",
		kind: "training",
		purpose: "Controls use of your content for Apple Intelligence",
	},
	{
		token: "CCBot",
		owner: "Common Crawl",
		kind: "training",
		purpose: "Builds the open web crawl many models train on",
	},
];

export type CrawlerAccess = "allowed" | "blocked" | "unknown";

interface Group {
	agents: string[];
	rules: { allow: boolean; pattern: string }[];
}

function parseGroups(robotsTxt: string): Group[] {
	const groups: Group[] = [];
	let current: Group | null = null;
	let lastWasAgent = false;
	for (const rawLine of robotsTxt.split(/\r?\n/)) {
		const line = rawLine.replace(/#.*$/, "").trim();
		const separator = line.indexOf(":");
		if (separator === -1) continue;
		const field = line.slice(0, separator).trim().toLowerCase();
		const value = line.slice(separator + 1).trim();
		if (field === "user-agent") {
			if (!current || !lastWasAgent) {
				current = { agents: [], rules: [] };
				groups.push(current);
			}
			current.agents.push(value.toLowerCase());
			lastWasAgent = true;
		} else if ((field === "allow" || field === "disallow") && current) {
			current.rules.push({ allow: field === "allow", pattern: value });
			lastWasAgent = false;
		} else {
			lastWasAgent = false;
		}
	}
	return groups;
}

function patternMatches(pattern: string, path: string): boolean {
	const anchored = pattern.endsWith("$");
	const body = anchored ? pattern.slice(0, -1) : pattern;
	const regex = body
		.split("*")
		.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${regex}${anchored ? "$" : ""}`).test(path);
}

export function isAllowedByRobots(robotsTxt: string, crawler: string, path = "/"): boolean {
	const groups = parseGroups(robotsTxt);
	const token = crawler.toLowerCase();
	let matching = groups.filter((group) => group.agents.includes(token));
	if (matching.length === 0) matching = groups.filter((group) => group.agents.includes("*"));

	let best: { allow: boolean; length: number } | null = null;
	for (const rule of matching.flatMap((group) => group.rules)) {
		if (!rule.pattern) continue;
		if (!patternMatches(rule.pattern, path)) continue;
		const length = rule.pattern.length;
		if (!best || length > best.length || (length === best.length && rule.allow)) {
			best = { allow: rule.allow, length };
		}
	}
	return best?.allow ?? true;
}

export function aiCrawlerAccess(robotsTxt: string | null): { crawler: AiCrawler; access: CrawlerAccess }[] {
	return AI_CRAWLERS.map((crawler) => ({
		crawler,
		access: robotsTxt === null ? "unknown" : isAllowedByRobots(robotsTxt, crawler.token) ? "allowed" : "blocked",
	}));
}
