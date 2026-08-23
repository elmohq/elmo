import type { FaqItem } from "@/lib/faqs";

/**
 * The free tools at /tools. One entry drives the index card, the page metadata,
 * the SoftwareApplication JSON-LD, and the sitemap, so a new tool is a data
 * change plus a route.
 */
export interface FreeTool {
	slug: string;
	/** Product name, used in JSON-LD and on the index. */
	name: string;
	/** SERP title. These queries are won by tools, so it leads with the tool. */
	metaTitle: string;
	description: string;
	/** One line for the index card. */
	short: string;
	faqs: FaqItem[];
}

export const freeTools: FreeTool[] = [
	{
		slug: "llms-txt-generator",
		name: "llms.txt Generator",
		metaTitle: "Free llms.txt Generator: Any Site, No Signup · Elmo",
		description:
			"Paste a domain and get an llms.txt file built from its sitemap, with real page titles and descriptions. Free, no signup, copy or download in one click.",
		short: "Build an llms.txt from any site's sitemap, with real page titles and descriptions.",
		faqs: [
			{
				question: "What is an llms.txt file?",
				answer:
					"llms.txt is a plain-Markdown file at the root of a site that gives AI agents a map of its contents: an H1 with the site name, a one-line summary, and sections of annotated links to the pages that matter. It is a convention proposed at llmstxt.org, not a standard any engine is required to follow.",
			},
			{
				question: "How does this generator build the file?",
				answer:
					"It reads your robots.txt for a Sitemap line (falling back to /sitemap.xml and the other conventional paths), collects up to 60 same-origin page URLs, then fetches each page for its title and meta description. Pages are grouped into sections by their top-level path, so /blog/ pages land under Blog.",
			},
			{
				question: "Do llms.txt files actually help AI visibility?",
				answer:
					"Mostly indirectly. Models are not trained to look for llms.txt, and it appears in no major system prompt, so the common case is an agent already on your site following a link to it. The downside is close to zero and the upside is real for agentic browsing, which is why we serve one and recommend linking to it.",
			},
			{
				question: "Where do I put the file?",
				answer:
					"At the root of your domain, served as text/plain at /llms.txt, and linked from your pages so an agent browsing your site can find it. Review the generated file before you publish it — it is a starting point built from your sitemap, not a finished document.",
			},
			{
				question: "Is there a limit on site size?",
				answer:
					"The generator reads up to 60 URLs from up to four sitemap files. Larger sites get the first 60 and a note saying so; edit the result to cover the sections that matter most to you.",
			},
		],
	},
	{
		slug: "ai-crawler-checker",
		name: "AI Crawler Checker",
		metaTitle: "AI Crawler & robots.txt Checker: Free Test · Elmo",
		description:
			"Check whether GPTBot, ClaudeBot, PerplexityBot, Googlebot and 10 more AI crawlers are allowed or blocked by your robots.txt. Free, instant, no signup.",
		short: "See which AI crawlers your robots.txt allows, and which ones it quietly blocks.",
		faqs: [
			{
				question: "How does this checker work?",
				answer:
					"It fetches your robots.txt and evaluates it the way a compliant crawler does, following RFC 9309: each bot obeys the most specific user-agent group that matches its name, the longest matching path pattern wins, and Allow beats Disallow on a tie. No JavaScript is executed and nothing is stored.",
			},
			{
				question: "Which AI crawlers does it check?",
				answer:
					"Fourteen: GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, ClaudeBot, Claude-User, Googlebot, Google-Extended, Bingbot, Amazonbot, Applebot-Extended, Meta-ExternalAgent, and CCBot. They cover model training, search indexing, and live per-query fetches.",
			},
			{
				question: "Does blocking Google-Extended remove me from AI Overviews?",
				answer:
					"No. Google-Extended only governs whether your content trains Gemini and grounds Vertex AI. AI Overviews and AI Mode are part of Google Search and use Googlebot, so blocking Googlebot is what removes you from Google's AI answers — along with classic search.",
			},
			{
				question: "My robots.txt returns a server error. Does that matter?",
				answer:
					"Yes. A robots.txt that keeps answering with a 5xx is treated as a site-wide disallow by Google and other major crawlers, which is stricter than having no file at all. A missing file (404) means everything is allowed; a broken one means nothing is.",
			},
			{
				question: "Is robots.txt enough to keep a page out of AI answers?",
				answer:
					"No. Robots.txt controls crawling, not indexing or training already done. To keep a page out of results entirely, leave it crawlable and use a noindex directive — a crawler that is blocked from the URL can never read the noindex on it.",
			},
		],
	},
];

export function requireFreeTool(slug: string): FreeTool {
	const tool = freeTools.find((entry) => entry.slug === slug);
	if (!tool) throw new Error(`Unknown free tool: ${slug}`);
	return tool;
}
