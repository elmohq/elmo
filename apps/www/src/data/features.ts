import type { FeatureKey } from "@/lib/competitors";
import type { FaqItem } from "@/lib/faqs";

/** Which product visual sits beside a feature; mapped to a component in components/features.tsx. */
export type FeatureGraphicKey =
	| "overview"
	| "visibility"
	| "share-of-voice"
	| "sentiment"
	| "citations"
	| "query-fan-out"
	| "prompts"
	| "responses"
	| "opportunities"
	| "trend"
	| "api"
	| "engines";

export interface FeatureLink {
	title: string;
	href: string;
	/** Shown above the title, e.g. "Docs" or "Blog". */
	kind: "Docs" | "Blog" | "Glossary" | "Guide" | "Tool directory";
}

export interface ProductFeature {
	slug: string;
	/** Short name for cards, breadcrumbs, and related-feature links. */
	name: string;
	/** H1. Written in the phrasing people search with. */
	title: string;
	metaTitle: string;
	metaDescription: string;
	/** Hero paragraph: a self-contained answer to "what does this do". */
	lede: string;
	/** One or two sentences for the index card. */
	summary: string;
	graphic: FeatureGraphicKey;
	/** A second visual shown beside "What you can do". */
	secondaryGraphic?: FeatureGraphicKey;
	/** "What you can do": three numbered steps. */
	steps: { name: string; text: string }[];
	/** "Data you can act on": the measures the feature reports. */
	metrics: { term: string; definition: string }[];
	useCases: string[];
	why: { name: string; text: string }[];
	/** The docs page that documents the feature in the product. */
	docs: { title: string; href: string };
	guides: FeatureLink[];
	/** Matching tool-directory slices; only the ones with an indexed page are linked. */
	directoryFeatures?: FeatureKey[];
	related: string[];
	faqs: FaqItem[];
}

export const productFeatures: ProductFeature[] = [
	{
		slug: "ai-visibility-tracking",
		name: "AI visibility tracking",
		title: "AI visibility tracking",
		metaTitle: "AI Visibility Tracking: Monitor Your Brand in ChatGPT & AI Search · Elmo",
		metaDescription:
			"Track how often ChatGPT, Google AI Overviews, Perplexity, Gemini, and other AI engines mention your brand, per prompt and per model, and how that changes over time.",
		lede: "Elmo runs the questions your buyers ask through every AI engine you track, on a schedule, and measures how often the answers mention your brand. See your visibility per prompt and per model, and watch how it moves over weeks and months against your competitors.",
		summary:
			"How often AI answers mention your brand, per prompt and per model, with trends over time against every competitor.",
		graphic: "visibility",
		secondaryGraphic: "trend",
		steps: [
			{
				name: "Track the prompts that matter",
				text: "Add the questions your buyers ask AI, or let Elmo suggest them from your website. Each prompt runs against every engine you track, on a schedule.",
			},
			{
				name: "See where you show up",
				text: "Filter by AI model, tags, and time range to see your visibility score for every prompt, with trend lines comparing your brand against competitors.",
			},
			{
				name: "Watch the trend",
				text: "Look back a week, a month, a year, or over all time to spot the impact of content changes and market shifts.",
			},
		],
		metrics: [
			{
				term: "AI visibility",
				definition: "The share of AI answers to your prompts that mention your brand.",
			},
			{
				term: "Share of voice",
				definition: "Your brand's share of every mention of you and your tracked competitors.",
			},
			{
				term: "Sentiment",
				definition: "How favorably AI talks about your brand when it mentions you, from 0 to 100. 50 is neutral.",
			},
			{
				term: "Position",
				definition:
					"Where your brand comes among the tracked companies an answer names, on average. 1 means named first.",
			},
			{
				term: "Per-prompt visibility",
				definition: "Each prompt's score and trend, so you can see which questions you win and which you lose.",
			},
			{
				term: "Visibility by model",
				definition: "You and every tracked competitor, side by side for each AI engine.",
			},
		],
		useCases: [
			"Get a baseline of how visible your brand is in AI answers before you change anything.",
			"Find the prompts and engines where competitors appear and you don't, then focus content work there.",
			"Show whether visibility is improving month over month, on numbers you can trace back to individual answers.",
		],
		why: [
			{
				name: "The real apps, not just APIs",
				text: "ChatGPT, Google AI Overviews, AI Mode, Gemini, Perplexity, and Copilot are scraped from the interfaces your customers use, with direct APIs for everything else.",
			},
			{
				name: "Open methodology",
				text: "How a mention is counted is documented and the code is open source, so every number can be checked rather than taken on trust.",
			},
			{
				name: "Every answer behind the number",
				text: "Click through from any score to the exact responses it was built from.",
			},
		],
		docs: { title: "Visibility tracking docs", href: "/docs/user-guide/visibility" },
		guides: [
			{ kind: "Blog", title: "What metrics matter for AI search visibility?", href: "/blog/iab-ai-visibility-metrics" },
			{
				kind: "Blog",
				title: "Why do two AI visibility tools give your brand different scores?",
				href: "/blog/why-ai-visibility-scores-differ",
			},
			{ kind: "Blog", title: "How often should you run AEO prompt tracking?", href: "/blog/ai-prompt-tracking" },
			{ kind: "Glossary", title: "Visibility score", href: "/glossary/visibility-score" },
		],
		directoryFeatures: ["visibilityScore", "multiLlmTracking"],
		related: ["share-of-voice", "multi-engine-tracking", "prompt-tracking"],
		faqs: [
			{
				question: "How does Elmo measure AI visibility?",
				answer:
					"Elmo runs each of your prompts against the AI engines you track and records every answer. Your visibility is the share of those answers that mention your brand, counting each prompt's latest answers, so the overview's cards, chart, and table always agree.",
			},
			{
				question: "How does Elmo decide whether an answer mentions my brand?",
				answer:
					"Elmo finds every place an answer uses your brand's name, an alias, or one of its domains, then has a language model built for judging text confirm the answer is really about your brand. A name that means something else, or a different company with the same name, isn't counted.",
			},
			{
				question: "Why does my visibility change from day to day?",
				answer:
					"AI answers vary from run to run, even for the same prompt. Running the same prompts repeatedly turns noisy one-off answers into a trend, which is why Elmo tracks on a schedule rather than checking once.",
			},
			{
				question: "How often does Elmo check my prompts?",
				answer:
					"On Elmo Cloud, prompts run once or up to four times a day depending on the plan. On a self-hosted instance you set the cadence yourself.",
			},
		],
	},
	{
		slug: "share-of-voice",
		name: "Share of voice",
		title: "AI share of voice and competitor tracking",
		metaTitle: "AI Share of Voice & Competitor Analysis for AI Search · Elmo",
		metaDescription:
			"See how often AI engines mention you versus your competitors. Elmo ranks every tracked company by share of voice, per model and over time.",
		lede: "Share of voice is your brand's share of every mention of you and your tracked competitors in AI answers. Elmo ranks every company on a live leaderboard, charts your top competitors over time, and compares you with each of them on every AI engine you track.",
		summary: "Your share of AI mentions against every tracked competitor, on a leaderboard, per model, and over time.",
		graphic: "share-of-voice",
		steps: [
			{
				name: "Add your competitors",
				text: "Elmo suggests competitors from your website when you set up a brand. Add or edit them, with their own domains and aliases, any time.",
			},
			{
				name: "See who AI names most",
				text: "The leaderboard ranks your brand against every competitor by mentions, prompts, and share, for any model, tag, or time range.",
			},
			{
				name: "Track the race over time",
				text: "Share of voice trends chart you against your top competitors, so you can see who is gaining ground and when it started.",
			},
		],
		metrics: [
			{
				term: "Share of voice",
				definition: "Your brand's share of every mention of you and your tracked competitors.",
			},
			{
				term: "Mentions",
				definition: "How many AI answers named each company in the selected period.",
			},
			{
				term: "Prompts",
				definition: "How many distinct prompts each company appeared in.",
			},
			{
				term: "Share of voice trends",
				definition: "You and your top competitors over time, ending on today's figure.",
			},
			{
				term: "Competitors by model",
				definition: "Visibility, share of voice, sentiment, and position for every tracked company on each AI engine.",
			},
		],
		useCases: [
			"Find out which competitor AI recommends most in your category, and on which engines.",
			"Spot a competitor gaining share early, before it shows up in pipeline.",
			"Benchmark against the brands you lose deals to, not a generic industry average.",
		],
		why: [
			{
				name: "Competitors judged like you",
				text: "Competitor mentions go through the same name, alias, and domain matching and the same judging as yours, so the comparison is fair.",
			},
			{
				name: "Edits apply to the past",
				text: "Add a competitor or change its aliases and Elmo re-judges recent responses for that company in the background, so history stays comparable.",
			},
			{
				name: "Every engine separately",
				text: "Share of voice in ChatGPT and in Google AI Overviews can tell very different stories. Elmo shows both.",
			},
		],
		docs: { title: "Competitor settings docs", href: "/docs/user-guide/settings" },
		guides: [
			{
				kind: "Blog",
				title: "AI share of voice: measuring brand presence in AI search",
				href: "/blog/ai-share-of-voice",
			},
			{ kind: "Blog", title: "Competitor analysis for AI search", href: "/blog/ai-competitor-analysis" },
			{
				kind: "Blog",
				title: "Do AI engines favor big brands over smaller ones?",
				href: "/blog/do-ai-engines-favor-big-brands",
			},
			{ kind: "Glossary", title: "Share of voice", href: "/glossary/share-of-voice" },
		],
		directoryFeatures: ["competitorBenchmarking"],
		related: ["ai-visibility-tracking", "citation-tracking", "sentiment-analysis"],
		faqs: [
			{
				question: "What is AI share of voice?",
				answer:
					"AI share of voice is your brand's share of all the mentions of you and your tracked competitors in AI answers. If AI answers mention your brand 30 times and your competitors 70 times in total, your share of voice is 30%.",
			},
			{
				question: "How is share of voice different from visibility?",
				answer:
					"Visibility is the share of answers that mention you at all. Share of voice compares you with your competitors: it can fall even while your visibility holds steady, if competitors are mentioned more often.",
			},
			{
				question: "How many competitors can I track?",
				answer:
					"Up to 500 per brand. Because a raw share depends on how many competitors you track, Elmo grades your share of voice by your rank among them rather than by the percentage alone.",
			},
		],
	},
	{
		slug: "sentiment-analysis",
		name: "Sentiment analysis",
		title: "AI sentiment analysis and brand mention tracking",
		metaTitle: "AI Sentiment Analysis & Brand Mention Tracking · Elmo",
		metaDescription:
			"See how ChatGPT and other AI engines describe your brand. Elmo scores the sentiment of every answer that mentions you, beside each competitor, with the passages behind the score.",
		lede: "Being mentioned is half the story; how AI describes you is the other half. Elmo reads every answer that names your brand for praise or criticism, scores it from 0 to 100 beside each competitor and per model, and shows you the exact passages behind the score.",
		summary:
			"Every answer that names you, read for praise or criticism and scored 0 to 100, with the passages behind it.",
		graphic: "sentiment",
		secondaryGraphic: "responses",
		steps: [
			{
				name: "Catch every real mention",
				text: "Elmo matches your brand's name, aliases, and domains, then confirms each answer is really about your brand, not a word that means something else.",
			},
			{
				name: "See how AI describes you",
				text: "Each answer that names you is classed as positive, neutral, mixed, or negative, and scored beside your competitors and per AI engine.",
			},
			{
				name: "Read the passages",
				text: "Open the clearest praise and criticism, linked to the prompt they came from, or filter every response down to just the negative ones.",
			},
		],
		metrics: [
			{
				term: "Sentiment score",
				definition:
					"0 to 100. Positive answers count 100, neutral and mixed 50, negative 0. Above 50, praise outweighs criticism.",
			},
			{
				term: "Sentiment split",
				definition: "How the answers that mention you divide into positive, neutral, mixed, and negative.",
			},
			{
				term: "Sentiment trends",
				definition: "Your score over time beside your top competitors'.",
			},
			{
				term: "Sentiment by model",
				definition: "The score for you and each tracked competitor, per AI engine.",
			},
			{
				term: "What AI says about you",
				definition: "The passages behind the clearest praise and criticism, one per prompt.",
			},
			{
				term: "Sentiment by prompt",
				definition: "Each prompt's score over the period, with links to its positive and negative answers.",
			},
		],
		useCases: [
			"Find the prompts where AI repeats an outdated complaint or a wrong fact about your product.",
			"Compare how AI describes you with how it describes competitors on the same questions.",
			"Check whether a launch, a fix, or a PR push changed how AI talks about you.",
		],
		why: [
			{
				name: "Neutral isn't negative",
				text: "Most answers state facts rather than opinions. A factual mention scores 50, so it never counts against you.",
			},
			{
				name: "Evidence, not just a number",
				text: "Click a company's badge on any response to highlight the passage its sentiment was read from.",
			},
			{
				name: "Mentions judged, not keyword-matched",
				text: "A language model built for judging text confirms each mention, so 'an apple a day' doesn't count for a brand called Apple.",
			},
		],
		docs: { title: "Sentiment docs", href: "/docs/user-guide/sentiment" },
		guides: [
			{ kind: "Blog", title: "AI sentiment analysis for brands", href: "/blog/ai-brand-sentiment" },
			{
				kind: "Blog",
				title: "Do AI search engines fact-check what they read about your brand?",
				href: "/blog/ai-search-fact-checking",
			},
			{ kind: "Blog", title: "Ghost citations: when AI cites you without naming you", href: "/blog/ghost-citations" },
			{ kind: "Glossary", title: "AI brand sentiment", href: "/glossary/ai-brand-sentiment" },
		],
		directoryFeatures: ["sentimentAnalysis", "brandMentionTracking"],
		related: ["ai-visibility-tracking", "prompt-tracking", "share-of-voice"],
		faqs: [
			{
				question: "How does Elmo score AI sentiment?",
				answer:
					"Each answer that names your brand is read for its sentiment toward you: positive, neutral, mixed, or negative. Positive answers count 100, neutral and mixed ones 50, and negative ones 0, and the score is the average. Answers that don't mention you aren't counted.",
			},
			{
				question: "What does a sentiment score of 50 mean?",
				answer:
					"50 means AI is neutral about you on balance. Above 50, praise outweighs criticism; below it, criticism outweighs praise.",
			},
			{
				question: "Does Elmo track sentiment for competitors too?",
				answer:
					"Yes. Every tracked competitor gets the same sentiment reading, so you can compare scores side by side, overall and per AI engine.",
			},
			{
				question: "What counts as a brand mention?",
				answer:
					"An answer that talks about your brand, or cites a link containing your brand's name or domain. An answer that uses the name to mean something else, refers to a different company with the same name, or says it has no information about you isn't counted.",
			},
		],
	},
	{
		slug: "citation-tracking",
		name: "Citation tracking",
		title: "AI citation tracking",
		metaTitle: "AI Citation Tracking: See Which Sources AI Engines Cite · Elmo",
		metaDescription:
			"See which domains and URLs ChatGPT, Perplexity, and Google AI cite for your prompts, which of your own pages get cited, and how sources shift over time.",
		lede: "AI answers are built from sources. Elmo records every URL the engines cite for your prompts, so you can see which domains and pages they trust in your category, which of your own pages get cited, where competitors are cited and you aren't, and how the sources shift over time.",
		summary:
			"Which domains and pages AI cites for your prompts, including your own, broken down by category and tracked over time.",
		graphic: "citations",
		steps: [
			{
				name: "See what AI trusts",
				text: "Rank the domains and URLs AI engines cite most for your prompts, filtered by model, tags, and time range.",
			},
			{
				name: "Find your own pages",
				text: "See your brand's share of all citations and exactly which of your pages are cited, and for which prompts.",
			},
			{
				name: "Catch the shifts",
				text: "Track new and dropped pages and domains, and the prompts where competitors are cited but your brand isn't.",
			},
		],
		metrics: [
			{
				term: "Brand citation share",
				definition: "The percentage of all citations that link to your brand's domains.",
			},
			{
				term: "Top domains and URLs",
				definition: "The sources AI engines cite most for your prompts, with each page's title and type.",
			},
			{
				term: "Source categories",
				definition:
					"Citations grouped as brand, competitor, editorial, reviews, e-commerce, social, developer, PR, reference, and institutional.",
			},
			{
				term: "Page types",
				definition:
					"Whether cited pages are articles, listicles, comparisons, reviews, how-tos, docs, forums, videos, and more.",
			},
			{
				term: "Recent changes",
				definition: "New and dropped pages, and new and dropped domains.",
			},
			{
				term: "Content gaps",
				definition: "Prompts where competitors are cited but your brand isn't.",
			},
			{
				term: "Reddit and Google Shopping",
				definition: "Which subreddits get cited, and the products Google AI Mode surfaces from Shopping.",
			},
		],
		useCases: [
			"Build an outreach list from the third-party pages AI cites in your category.",
			"See which of your own pages earn citations, and which never do.",
			"Find the prompts where a competitor's page is the source and yours isn't, then write the page that should be.",
		],
		why: [
			{
				name: "Categorized for you",
				text: "Every cited domain is sorted into a category from a maintained list, so you see the shape of your sources without tagging them by hand.",
			},
			{
				name: "Counted once per answer",
				text: "A page an answer cites twice counts once, and each prompt citing a page counts once, so popular pages don't inflate the totals.",
			},
			{
				name: "From the real interfaces",
				text: "Citations come from the scraped consumer apps where possible, which can cite differently from the same model's API.",
			},
		],
		docs: { title: "Citation analysis docs", href: "/docs/user-guide/citations" },
		guides: [
			{ kind: "Blog", title: "AI citations: what they are and how to earn them", href: "/blog/ai-citations" },
			{ kind: "Blog", title: "Where AI citations come from", href: "/blog/where-ai-citations-come-from" },
			{
				kind: "Blog",
				title: "Citation volatility: how much do the sources AI cites change?",
				href: "/blog/citation-volatility",
			},
			{
				kind: "Blog",
				title: "Do AI engines cite the same sources?",
				href: "/blog/do-ai-engines-cite-the-same-sources",
			},
		],
		directoryFeatures: ["citationAnalytics", "contentGapAnalysis"],
		related: ["query-fan-out", "aeo-recommendations", "share-of-voice"],
		faqs: [
			{
				question: "What is AI citation tracking?",
				answer:
					"AI citation tracking records the sources AI engines link to when they answer a question. It shows which websites shape the answers in your category, and whether your own pages are among them.",
			},
			{
				question: "Can I see which of my own pages AI engines cite?",
				answer:
					"Yes. Citations to your brand's domains are grouped as brand citations, and the top URLs list shows each of your cited pages and the prompts that cited them. Add extra domains, like a blog subdomain, in your brand settings.",
			},
			{
				question: "Which engines return citations?",
				answer:
					"Engines that search the web, like ChatGPT with search, Perplexity, Google AI Overviews, and AI Mode, cite their sources. A model called through an API without web search returns no citations.",
			},
		],
	},
	{
		slug: "query-fan-out",
		name: "Query fan-out",
		title: "Query fan-out tracking",
		metaTitle: "Query Fan-Out Tracking: See the Searches Behind AI Answers · Elmo",
		metaDescription:
			"AI engines turn one prompt into several web searches. Elmo tracks the exact fan-out queries ChatGPT and other engines run for your prompts, and how they rewrite your wording.",
		lede: "When an AI engine with web search answers a prompt, it often runs several web searches first. Elmo records those fan-out queries for every prompt, so you can see what the engines actually search for, which searches recur across your category, and how they rewrite your wording.",
		summary: "The web searches AI engines run behind each answer, and the words they add to or drop from your prompts.",
		graphic: "query-fan-out",
		steps: [
			{
				name: "See every search",
				text: "Open any prompt to see the web searches each engine ran while answering it, and how often each one recurred.",
			},
			{
				name: "Find the recurring queries",
				text: "Top queries surface the searches that come up again and again across all your prompts.",
			},
			{
				name: "Learn how engines rewrite you",
				text: "Query words show which words from your prompt engines keep, which they drop, and which they add, like 'best', a year, or 'vs'.",
			},
		],
		metrics: [
			{ term: "Queries", definition: "The distinct web searches engines ran for your prompts." },
			{
				term: "Average fan-out",
				definition: "Average searches per run, counting runs that issued at least one web search.",
			},
			{
				term: "Search prompt runs",
				definition: "How many times your prompts ran on engines configured with web search.",
			},
			{
				term: "Runs with known and unknown queries",
				definition:
					"Search runs that exposed their queries, and those where the engine didn't search or didn't reveal what it searched.",
			},
			{
				term: "Added, preserved, and dropped words",
				definition: "How engines rewrite your prompt wording on the way to a search.",
			},
		],
		useCases: [
			"Find the search phrasing to target, based on what the engines actually search for rather than what you guess.",
			"See the qualifiers engines add, like the current year or 'vs', and cover them in your content.",
			"Check whether your pages rank for the searches behind the prompts you're losing.",
		],
		why: [
			{
				name: "Straight from the runs",
				text: "Every figure comes from the searches recorded on real prompt runs, the same way for every provider.",
			},
			{
				name: "Honest about gaps",
				text: "Some engines don't reveal their searches. Elmo counts those runs separately instead of guessing what they searched for.",
			},
			{
				name: "Only real rewrites",
				text: "A search that just repeats your prompt says nothing about how it was rewritten, so the page leaves those out.",
			},
		],
		docs: { title: "Provider docs", href: "/docs/user-guide/providers" },
		guides: [
			{
				kind: "Blog",
				title: "ChatGPT UI now cites Reddit the same amount as the OpenAI API",
				href: "/blog/chatgpt-ui-reddit-citations-api",
			},
			{
				kind: "Blog",
				title: "Does ranking in Google's top 10 get you cited by AI?",
				href: "/blog/rankings-and-ai-citations",
			},
			{ kind: "Blog", title: "Multi-turn AI search: what prompt tracking misses", href: "/blog/multi-turn-ai-search" },
		],
		directoryFeatures: ["queryFanOut"],
		related: ["citation-tracking", "prompt-tracking", "aeo-recommendations"],
		faqs: [
			{
				question: "What is query fan-out?",
				answer:
					"Query fan-out is an AI engine breaking one question into several web searches, retrieving results for each, and writing a single answer from what it found. The searches it runs decide which pages it can cite.",
			},
			{
				question: "Which AI engines show their fan-out queries?",
				answer:
					"It depends on the engine and on the provider used to reach it. Elmo shows the queries wherever they're exposed, and counts runs where an engine searched without revealing its queries separately.",
			},
			{
				question: "How do I use fan-out queries?",
				answer:
					"Treat them as the searches your content has to rank for. If an engine searches for 'best CRM for startups 2026' when answering your prompt, the pages that rank for that search are the ones it can cite.",
			},
		],
	},
	{
		slug: "prompt-tracking",
		name: "Prompt tracking",
		title: "AI prompt tracking",
		metaTitle: "AI Prompt Tracking: Monitor the Questions Buyers Ask AI · Elmo",
		metaDescription:
			"Track the prompts your buyers ask ChatGPT and other AI engines. Elmo suggests prompts from your website, tags them, and keeps every answer for you to search and inspect.",
		lede: "Prompts are the questions Elmo asks AI engines on your behalf. Elmo suggests them from your website, tags each one as branded or unbranded, lets you organize them with your own tags, and keeps every answer so you can search it, filter it, and see exactly what each engine said.",
		summary:
			"Suggested from your website, tagged and organized, with every AI answer kept for you to search and inspect.",
		graphic: "prompts",
		secondaryGraphic: "responses",
		steps: [
			{
				name: "Start from your website",
				text: "Paste your site and Elmo suggests products, competitors, aliases, and tagged starter prompts. Ask for more suggestions any time; it skips what you already track.",
			},
			{
				name: "Organize with tags",
				text: "Tag prompts by topic, product, or persona, then filter every page in Elmo by tag. Prompts that name your brand are marked branded automatically.",
			},
			{
				name: "Inspect every answer",
				text: "Open any prompt to see each engine's response, the brands it named and where, the searches it ran, and the sources it cited.",
			},
		],
		metrics: [
			{
				term: "Per-prompt visibility",
				definition: "How often answers to each prompt mention your brand, and the trend.",
			},
			{
				term: "Branded and unbranded",
				definition: "Whether a prompt names your brand, set automatically and overridable with a tag.",
			},
			{
				term: "Brands mentioned",
				definition: "Each company an answer names, with its position and the answer's sentiment toward it.",
			},
			{
				term: "Responses",
				definition:
					"Every AI answer to your prompts, searchable by its text and filterable by prompt, model, and sentiment.",
			},
			{
				term: "Prompt history",
				definition: "Each prompt's mentions, web queries, citations, and responses over time, and when it runs next.",
			},
		],
		useCases: [
			"Separate branded prompts (people already asking about you) from unbranded category prompts where you have to earn the mention.",
			"Group prompts by product line or audience and compare visibility between them.",
			"Read exactly what ChatGPT said about you last Tuesday, and how that compares with today.",
		],
		why: [
			{
				name: "Prompts you can see and edit",
				text: "Every prompt is plain text you control: add them one at a time or paste several at once, and pause or remove any of them.",
			},
			{
				name: "Nothing summarized away",
				text: "Every response is stored and shown in full, so any score can be traced back to the answers behind it.",
			},
			{
				name: "Same data over API and MCP",
				text: "Create and update prompts, and read runs, from the API or an AI assistant connected over MCP.",
			},
		],
		docs: { title: "Prompt docs", href: "/docs/user-guide/prompt-wizard" },
		guides: [
			{ kind: "Blog", title: "How often should you run AEO prompt tracking?", href: "/blog/ai-prompt-tracking" },
			{ kind: "Blog", title: "Multi-turn AI search: what prompt tracking misses", href: "/blog/multi-turn-ai-search" },
			{ kind: "Glossary", title: "Prompt tracking", href: "/glossary/prompt-tracking" },
			{ kind: "Glossary", title: "Prompt volume", href: "/glossary/prompt-volume" },
		],
		directoryFeatures: ["multiLlmTracking"],
		related: ["ai-visibility-tracking", "query-fan-out", "sentiment-analysis"],
		faqs: [
			{
				question: "What is AI prompt tracking?",
				answer:
					"AI prompt tracking means asking AI engines the same set of questions on a schedule and recording how they answer: whether they mention your brand, how they describe it, and which sources they cite.",
			},
			{
				question: "Where do the prompts come from?",
				answer:
					"When you add a brand, Elmo analyzes your website and suggests starter prompts with tags. You can edit them, write your own, paste several at once, or ask for fresh suggestions later.",
			},
			{
				question: "How many prompts can I track?",
				answer:
					"Elmo Cloud plans include 50 to 350 prompts, depending on the plan. Self-hosted, you pay your scraping and model providers for each run instead of a plan.",
			},
			{
				question: "What's the difference between branded and unbranded prompts?",
				answer:
					"A branded prompt names your brand, like 'Is Acme good for small teams?'. An unbranded prompt is a category question, like 'best CRM for small teams', where AI chooses which brands to mention. Elmo tags each prompt automatically, and you can override it.",
			},
		],
	},
	{
		slug: "aeo-recommendations",
		name: "Opportunities",
		title: "AEO recommendations",
		metaTitle: "AEO Recommendations: What to Do Next to Get Cited by AI · Elmo",
		metaDescription:
			"Elmo turns your tracked AI visibility and citation data into concrete opportunities: content to create, pages to refresh, sites to pitch, and communities to join.",
		lede: "Elmo's Opportunities page turns your tracked answers and citations into a short list of things to do: content to create, existing pages to refresh, third-party sites to pitch, and community conversations to join. Each one explains why, and links to the prompts and cited pages behind it.",
		summary:
			"Content to create, pages to refresh, and sources to pitch, generated from your own visibility and citation data.",
		graphic: "opportunities",
		steps: [
			{
				name: "Read the summary",
				text: "A few plain bullets on where you stand: what's working, what's slipping, and where competitors lead.",
			},
			{
				name: "Pick an opportunity",
				text: "Recommendations are grouped into creation, existing content, outreach, and social, each with a plain-language reason.",
			},
			{
				name: "Check the evidence",
				text: "Every opportunity links to the prompts it's about, your pages cited for them, and the competitor pages cited instead.",
			},
		],
		metrics: [
			{
				term: "Creation",
				definition:
					"Net-new content to publish or earn, like comparisons, guides, and 'best of' angles for topics you're absent on.",
			},
			{
				term: "Existing content",
				definition: "Pages already getting cited that are slipping, or could win the mention with a refresh.",
			},
			{
				term: "Outreach",
				definition: "Placements on the third-party review sites and editorial roundups AI engines cite.",
			},
			{
				term: "Social",
				definition: "The Reddit, YouTube, and forum conversations AI engines pull from.",
			},
			{
				term: "Reality check",
				definition: "The risks and limits to keep in mind before acting.",
			},
		],
		useCases: [
			"Turn a month of tracking data into a content and outreach plan for the next sprint.",
			"Find the review sites and roundups to pitch, based on what AI actually cites for your prompts.",
			"Hand an agent or a writer a specific brief with the prompts and competitor pages attached.",
		],
		why: [
			{
				name: "Built on your data",
				text: "Opportunities come from your own per-prompt visibility, competitor standings, and citations over the last 30 days, not generic best practices.",
			},
			{
				name: "Evidence attached",
				text: "Each recommendation shows the prompts and cited pages behind it, so you can judge it before acting.",
			},
			{
				name: "Refreshed weekly",
				text: "The list is regenerated about once a week as new data comes in, and shows when it was last evaluated.",
			},
		],
		docs: { title: "Using citation data", href: "/docs/user-guide/citations" },
		guides: [
			{ kind: "Guide", title: "Off-site AEO", href: "/off-site-aeo" },
			{ kind: "Blog", title: "How long does it take to get cited by AI?", href: "/blog/how-long-to-get-cited-by-ai" },
			{
				kind: "Blog",
				title: "Do self-promotional 'best of' listicles help AI visibility?",
				href: "/blog/self-promotional-listicles-ai-visibility",
			},
			{
				kind: "Blog",
				title: "Do press releases get your brand into AI answers?",
				href: "/blog/press-releases-ai-visibility",
			},
		],
		directoryFeatures: ["actionRecommendations", "contentGapAnalysis"],
		related: ["citation-tracking", "query-fan-out", "ai-visibility-reporting"],
		faqs: [
			{
				question: "How does Elmo generate AEO recommendations?",
				answer:
					"Elmo assembles a digest of your tracked data, including visibility per platform, each prompt's standing against the leading competitor over 7 and 30 days, and the citation landscape, and asks a language model to turn it into categorized opportunities. The prompts and cited pages behind each one are attached from your data.",
			},
			{
				question: "How often are opportunities updated?",
				answer: "About once a week. The page shows when the current list was generated.",
			},
			{
				question: "Should I act on every recommendation?",
				answer:
					"No. They're generated by AI from your citation data and are a starting point. Each one shows its evidence so you can apply your own judgment first.",
			},
		],
	},
	{
		slug: "ai-visibility-reporting",
		name: "Reporting",
		title: "AI visibility reporting and dashboards",
		metaTitle: "AI Visibility Reporting & Dashboards for AI Search · Elmo",
		metaDescription:
			"Report AI search performance with Elmo's overview dashboard, branded chart exports, printable share-of-voice reports, and an API for your own BI tools.",
		lede: "Elmo's overview puts visibility, share of voice, sentiment, and position on one screen, with every competitor ranked beside you. Export any chart as a branded PNG for a deck, generate printable share-of-voice reports, or pull the numbers into your own dashboards through the API.",
		summary:
			"An overview dashboard, branded chart exports, printable share-of-voice reports, and an API for your own BI.",
		graphic: "overview",
		steps: [
			{
				name: "Start from the overview",
				text: "Four headline cards, how they changed, and a comparison of you and your competitors on every AI engine.",
			},
			{
				name: "Export for your deck",
				text: "Download prompt charts as PNGs, with your deployment's branding, sized for slides and reports.",
			},
			{
				name: "Send it where you report",
				text: "Generate a printable share-of-voice report, or pull analytics into a spreadsheet or BI tool through the REST API.",
			},
		],
		metrics: [
			{ term: "Headline cards", definition: "Visibility, share of voice, sentiment, and position, with their change." },
			{
				term: "Competitors by model",
				definition: "Every tracked company on every AI engine, sortable by any model or by the overall figure.",
			},
			{ term: "Prompts tracked and evaluations", definition: "How much tracking is behind the numbers." },
			{
				term: "Share of voice reports",
				definition:
					"Printable reports with share of voice, a competitive landscape, a per-prompt breakdown, top AI search queries, and recommendations.",
			},
		],
		useCases: [
			"Answer 'why is organic traffic down?' with numbers on how AI answers mention you instead.",
			"Drop branded charts into a monthly client or leadership report.",
			"Combine AI visibility with your other marketing data in your own BI tool.",
		],
		why: [
			{
				name: "Numbers you can defend",
				text: "Every figure traces back to stored answers, and the methodology is documented in the open.",
			},
			{
				name: "Your data, your tools",
				text: "Everything on the dashboard is available through the REST API, the TypeScript and Python SDKs, and the MCP server.",
			},
			{
				name: "White-label for agencies",
				text: "The white-label deployment adds custom branding, a custom domain, and SSO for agencies serving multiple clients.",
			},
		],
		docs: { title: "Reports docs", href: "/docs/user-guide/reports" },
		guides: [
			{
				kind: "Blog",
				title: "AI visibility reporting: what to show clients when organic traffic drops",
				href: "/blog/ai-visibility-client-reporting",
			},
			{
				kind: "Blog",
				title: "Who should own AI visibility: a dedicated hire or your SEO team?",
				href: "/blog/who-should-own-ai-visibility",
			},
			{
				kind: "Blog",
				title: "Can Google Search Console measure your AI visibility?",
				href: "/blog/search-console-ai-visibility",
			},
		],
		directoryFeatures: ["dataExportApi", "whiteLabelAgency"],
		related: ["ai-visibility-tracking", "api-and-mcp", "aeo-recommendations"],
		faqs: [
			{
				question: "What's in an Elmo share-of-voice report?",
				answer:
					"Share of voice against competitors, a competitive landscape, a per-prompt breakdown, the top web searches AI engines run in your category, and recommendations, laid out to print on US Letter. Admins on self-hosted and white-label deployments can generate one for any brand from its name and website.",
			},
			{
				question: "Can I export Elmo data into my own dashboards?",
				answer:
					"Yes. The REST API returns visibility, share of voice, citations, per-model, prompt, and query fan-out metrics, and the TypeScript and Python SDKs wrap it.",
			},
			{
				question: "Can I export charts?",
				answer: "Yes. Prompt charts download as PNGs that include your deployment's branding.",
			},
		],
	},
	{
		slug: "api-and-mcp",
		name: "API and MCP",
		title: "AI visibility API, SDKs, and MCP server",
		metaTitle: "AI Visibility API, SDKs & MCP Server · Elmo",
		metaDescription:
			"Elmo's REST API, TypeScript and Python SDKs, and MCP server give your code and AI assistants the same AI visibility data as the dashboard, on cloud or self-hosted.",
		lede: "Everything in Elmo is available outside the dashboard. A REST API covers brands, prompts, competitors, analytics, citations, query fan-out, runs, and opportunities. Typed TypeScript and Python SDKs wrap it, and an MCP server lets Claude Code, Codex, Cursor, VS Code, or OpenCode read your data and manage prompts directly.",
		summary:
			"A REST API, TypeScript and Python SDKs, an MCP server for AI assistants, and an AEO skill for coding agents.",
		graphic: "api",
		steps: [
			{
				name: "Issue a key, or sign in",
				text: "Create an organization API key, read-only or read-write, optionally limited to some brands and given an expiry. MCP clients can also just sign in from a browser.",
			},
			{
				name: "Call it from code",
				text: "Install @elmohq/sdk or elmo-sdk and list brands, pull analytics, or create prompts in a few lines.",
			},
			{
				name: "Ask your assistant",
				text: "Connect over MCP and ask 'What are some AEO opportunities for my brand?' Add the aeo skill for a full measure, diagnose, fix workflow.",
			},
		],
		metrics: [
			{
				term: "Analytics",
				definition:
					"Visibility, share of voice, sentiment, position, citations, per-model, prompt, and query fan-out metrics.",
			},
			{ term: "Runs", definition: "Every prompt evaluation, with the full response and its mention assessments." },
			{
				term: "Prompts, competitors, and brands",
				definition: "Manage the setup behind your tracking programmatically.",
			},
			{ term: "Opportunities", definition: "The latest generated recommendations for a brand." },
			{
				term: "MCP tools",
				definition:
					"Read tools like get_analytics, get_citations, and get_query_fanout, and write tools for creating and updating prompts.",
			},
		],
		useCases: [
			"Pipe AI visibility into a warehouse or BI tool alongside SEO and revenue data.",
			"Let a coding agent audit why a prompt lost visibility and draft the fix, using your real data.",
			"Keep prompts and competitors in sync across many brands from a script.",
		],
		why: [
			{
				name: "Included on every plan",
				text: "API and MCP access come with every Elmo Cloud plan and with every self-hosted instance.",
			},
			{
				name: "Scoped access",
				text: "An MCP client is only offered the tools its key allows, and no MCP tool deletes data or changes billing.",
			},
			{
				name: "Generated from the spec",
				text: "Both SDKs are generated from the OpenAPI spec the API serves, so new endpoints reach them without anyone writing them by hand.",
			},
		],
		docs: { title: "API reference", href: "/docs/api" },
		guides: [
			{ kind: "Docs", title: "MCP server", href: "/docs/api/mcp" },
			{ kind: "Docs", title: "TypeScript and Python SDKs", href: "/docs/api/sdks" },
			{ kind: "Docs", title: "The aeo skill", href: "/docs/api/skill" },
			{ kind: "Blog", title: "We audited the top AEO skills", href: "/blog/aeo-skill" },
		],
		directoryFeatures: ["dataExportApi", "mcpServer", "typescriptSdk", "pythonSdk"],
		related: ["ai-visibility-reporting", "prompt-tracking", "aeo-recommendations"],
		faqs: [
			{
				question: "Does Elmo have an API?",
				answer:
					"Yes. Elmo serves a REST API at /api/v1 on every deployment, with Bearer-token authentication and an OpenAPI spec at /api/v1/openapi.json.",
			},
			{
				question: "Which AI clients work with Elmo's MCP server?",
				answer:
					"Claude Code, Codex, Cursor, VS Code, and OpenCode have documented setup, and other clients that support remote MCP servers over HTTP work the same way. Sign in from the client, or send an API key as a bearer token.",
			},
			{
				question: "Is there an SDK?",
				answer:
					"Yes: @elmohq/sdk for TypeScript and elmo-sdk for Python, both generated from the same OpenAPI spec as the API.",
			},
			{
				question: "Does the MCP server work with a self-hosted instance?",
				answer:
					"Yes. The endpoint is at /api/mcp as soon as the instance is running. APP_URL must be the HTTPS address clients reach you on.",
			},
		],
	},
	{
		slug: "multi-engine-tracking",
		name: "AI engines",
		title: "Track your brand across every AI engine",
		metaTitle: "Multi-Engine AI Visibility Tracking: ChatGPT, AI Overviews, Gemini & More · Elmo",
		metaDescription:
			"Track your brand in ChatGPT, Google AI Overviews, AI Mode, Gemini, Perplexity, and Copilot from the real apps, plus Claude, Grok, Mistral, and any OpenRouter model.",
		lede: "Most AI search happens in ChatGPT and Google, and neither offers a public API for its consumer answers. Elmo scrapes ChatGPT, Google AI Overviews, AI Mode, Gemini, Perplexity, and Copilot from the interfaces your customers use, and calls Claude, Mistral, Grok, and any OpenRouter model directly.",
		summary:
			"ChatGPT, Google AI Overviews, AI Mode, Gemini, Perplexity, and Copilot from the real apps, plus any model by API.",
		graphic: "engines",
		steps: [
			{
				name: "Pick your engines",
				text: "Choose the engines that matter for your buyers. On a self-hosted instance, list them as scrape targets alongside the provider keys you bring.",
			},
			{
				name: "Run the same prompts everywhere",
				text: "Every prompt runs on every engine you track, so the results are directly comparable.",
			},
			{
				name: "Compare engine by engine",
				text: "Filter any page by model, and compare yourself with competitors on each engine side by side.",
			},
		],
		metrics: [
			{
				term: "Scraped from the real interface",
				definition: "ChatGPT, Google AI Overviews, Google AI Mode, Gemini, Perplexity, and Copilot.",
			},
			{
				term: "Direct model APIs",
				definition:
					"Claude, OpenAI, and Mistral models, and any model on OpenRouter, like Grok, DeepSeek, Kimi, or Perplexity Sonar, with or without web search.",
			},
			{
				term: "Scraping providers",
				definition:
					"Cloro, BrightData, Oxylabs, SearchApi, Olostep, and DataForSEO, with your own keys when self-hosting.",
			},
			{
				term: "Provider status",
				definition: "Reliability and speed of each scraping provider, measured continuously and published openly.",
			},
		],
		useCases: [
			"Compare how ChatGPT and Google AI Overviews treat your brand, since they often disagree.",
			"Add an engine your audience uses, like Copilot for enterprise buyers, without switching tools.",
			"Track a specific model version alongside the consumer app to see how much they differ.",
		],
		why: [
			{
				name: "What customers actually see",
				text: "A model's API isn't the consumer product. Scraping the real ChatGPT and Google surfaces is closer to the answers your buyers get.",
			},
			{
				name: "Bring your own providers",
				text: "Self-hosted, you pick the scraper and model keys and pay them directly, with no markup and no lock-in.",
			},
			{
				name: "Measured, not claimed",
				text: "Elmo runs every scraping provider continuously and publishes the results on its status page.",
			},
		],
		docs: { title: "Provider docs", href: "/docs/user-guide/providers" },
		guides: [
			{ kind: "Guide", title: "Provider status", href: "/status" },
			{ kind: "Guide", title: "How to show up in each AI search engine", href: "/ai-search" },
			{ kind: "Blog", title: "The best LLM scraping APIs, compared", href: "/blog/best-llm-scraping-apis" },
			{
				kind: "Blog",
				title: "Do AI engines cite the same sources?",
				href: "/blog/do-ai-engines-cite-the-same-sources",
			},
		],
		directoryFeatures: ["multiLlmTracking"],
		related: ["ai-visibility-tracking", "query-fan-out", "citation-tracking"],
		faqs: [
			{
				question: "Which AI engines does Elmo track?",
				answer:
					"ChatGPT, Google AI Overviews, Google AI Mode, Gemini, Perplexity, and Copilot are scraped from their real interfaces. Claude, Mistral, and OpenAI models are called through their APIs, and any OpenRouter model, including Grok, DeepSeek, and Kimi, can be added.",
			},
			{
				question: "Why scrape instead of using the API?",
				answer:
					"ChatGPT and Google AI Mode drive most AI search traffic and neither exposes a public API for its consumer answers. Calling the underlying model with web search approximates them, but it isn't what your customers see.",
			},
			{
				question: "Can I use my own scraping provider when self-hosting?",
				answer:
					"Yes. Elmo supports Cloro, BrightData, Oxylabs, SearchApi, Olostep, and DataForSEO, plus Anthropic, OpenAI, Mistral, and OpenRouter keys. You choose engines and providers in one setting.",
			},
		],
	},
];

export function getProductFeature(slug: string): ProductFeature | undefined {
	return productFeatures.find((f) => f.slug === slug);
}
