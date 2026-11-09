import type { FaqItem } from "@/lib/faqs";
import { type Competitor, type CompetitorCategory, ELMO_FEATURES, type FeatureKey, getFeatureLabel } from "./types";

// Prose-friendly category nouns (acronyms kept uppercase, descriptive words
// lowercased) so they read naturally mid-sentence — e.g. "an AI visibility
// tracking tool", "a traditional SEO tool".
export const CATEGORY_NOUN: Record<CompetitorCategory, string> = {
	tracking: "AI visibility tracking",
	content: "content generation",
	"api-developer": "developer API",
	ecommerce: "e-commerce",
	"seo-traditional": "traditional SEO",
	"open-source": "open-source",
	other: "AI visibility",
};

export function indefiniteArticle(phrase: string): "a" | "an" {
	return /^[aeiou]/i.test(phrase) ? "an" : "a";
}

export function isOpenSource(competitor: Competitor): boolean {
	return (competitor.features.openSource ?? false) || competitor.category === "open-source";
}

const INTEGRATION_FEATURES = [
	["sentimentAnalysis", "sentiment analysis"],
	["dataExportApi", "API access"],
	["mcpServer", "an MCP server"],
] as const;

function integrationSummary(competitor: Competitor): string {
	const has = INTEGRATION_FEATURES.filter(([key]) => competitor.features[key]).map(([, label]) => label);
	const lacks = INTEGRATION_FEATURES.filter(([key]) => !competitor.features[key]).map(([, label]) => label);
	const list = (items: string[], conjunction: string) =>
		items.length <= 2
			? items.join(` ${conjunction} `)
			: `${items.slice(0, -1).join(", ")}, ${conjunction} ${items[items.length - 1]}`;
	if (lacks.length === 0) return `${competitor.name} offers all three as well.`;
	if (has.length === 0) return `We have not found ${competitor.name} offering ${list(lacks, "or")}.`;
	return `${competitor.name} offers ${list(has, "and")}, but we have not found it offering ${list(lacks, "or")}.`;
}

const GETCITO_FORK_DATE = "July 10, 2026";
const GETCITO_REWRITE_DATE = "November 4, 2026";

// Engines in rough order of how much AI search traffic they carry, so the
// soundbite names the gaps a buyer is most likely to care about first.
const SOUNDBITE_ENGINES: FeatureKey[] = [
	"chatgpt",
	"googleAiMode",
	"googleAiOverviews",
	"gemini",
	"perplexity",
	"claude",
	"copilot",
	"grok",
];

const SOUNDBITE_FEATURES: [FeatureKey, string][] = [
	["dataExportApi", "API"],
	["mcpServer", "MCP server"],
	["sentimentAnalysis", "sentiment analysis"],
	["citationAnalytics", "citation tracking"],
];

// Copyleft and source-available licenses carry obligations that MIT doesn't.
const RESTRICTIVE_LICENSES: Record<string, string> = {
	"AGPL-3.0": "AGPL-3.0, so running a modified version as a service means publishing your changes",
	"GPL-3.0": "GPL-3.0, so any modified version you distribute has to be released under the GPL too",
	"FSL-1.1-ALv2": "source-available under the FSL, which bars competing commercial use for two years",
	"BUSL-1.1": "source-available under the BSL, which restricts production use",
};

function joinOr(items: string[]): string {
	if (items.length <= 2) return items.join(" or ");
	return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
}

/** The soundbite for a tool that shut down, pivoted, or was bought, if it did. */
function fateSoundbite(competitor: Competitor): string | undefined {
	const name = competitor.name;
	if (competitor.status === "defunct" || competitor.status === "shutting-down") {
		return `${name} has shut down. Elmo is open source, so the tool you build your reporting on can't disappear the same way.`;
	}
	if (competitor.status === "pivoted") {
		return `${name} has pivoted away from AI visibility. Elmo is open source and built for this one job, so it can't be pivoted out from under you.`;
	}
	if (competitor.status === "acquired") {
		if (competitor.fate) {
			return `${name} is gone as a standalone product. ${competitor.fate.summary} Elmo is MIT-licensed, so you keep the code and your data no matter what.`;
		}
		return `${name} has been acquired, so its roadmap is now set by its new owner. Elmo is MIT-licensed, so you keep the code and your data no matter what.`;
	}
	return undefined;
}

/**
 * The one-line case for Elmo over a tool, shown at the top of its comparison
 * page. Hand-written soundbites win; otherwise it leads with the most decisive
 * fact we hold: the tool is gone, was bought, carries a restrictive license, or
 * is missing engines and features Elmo has.
 */
export function getSoundbite(competitor: Competitor): string {
	if (competitor.soundbite) return competitor.soundbite;
	const name = competitor.name;

	const fate = fateSoundbite(competitor);
	if (fate) return fate;

	const license = competitor.license ? RESTRICTIVE_LICENSES[competitor.license] : undefined;
	if (license) {
		return `${name} is ${license}. Elmo is MIT-licensed, so you can run, modify, and embed it with no strings attached.`;
	}

	const tracksAnyEngine = SOUNDBITE_ENGINES.some((key) => competitor.features[key]);
	const missingEngines = tracksAnyEngine
		? SOUNDBITE_ENGINES.filter((key) => ELMO_FEATURES[key] && !competitor.features[key]).map(getFeatureLabel)
		: [];
	const missingFeatures = SOUNDBITE_FEATURES.filter(([key]) => ELMO_FEATURES[key] && !competitor.features[key]).map(
		([, label]) => label,
	);

	const gaps: string[] = [];
	if (missingEngines.length > 0) gaps.push(`doesn't list ${joinOr(missingEngines.slice(0, 3))} among its engines`);
	if (missingFeatures.length > 0) gaps.push(`has no ${joinOr(missingFeatures.slice(0, 2))}`);
	if (gaps.length > 0) {
		return `${name} ${gaps.join(" and ")}. Elmo has all of that, and it's free to self-host.`;
	}

	const price = competitor.pricing?.startingPrice;
	if (price && !isOpenSource(competitor)) {
		return `${name} starts at ${price} and is closed source. Elmo covers the same engines, and it's free to self-host.`;
	}
	if (isOpenSource(competitor)) {
		return `${name} and Elmo are both open source, so it comes down to fit: compare the engines and features below.`;
	}
	return `Elmo publishes the code behind every metric, so you can see exactly how a visibility score is calculated, and you can self-host it for free.`;
}

/**
 * A 40–60 word lead "answer block" for a comparison page, written to be lifted
 * verbatim into an AI answer for "Elmo vs {competitor}" style queries. Branches
 * on whether the competitor is itself open source so the claim stays accurate.
 */
export function getComparisonVerdict(competitor: Competitor): string {
	const name = competitor.name;

	if (competitor.slug === "getcito") {
		return `If you are considering ${name}, use Elmo instead. ${name} has never had a mature codebase: it started as a minimal vibe-coded tracker, switched to a fork of Elmo, and on ${GETCITO_REWRITE_DATE} replaced that with a new vibe-coded project dumped in as one 923,787-line commit. Elmo is mature, actively maintained, and free to self-host.`;
	}

	if (isOpenSource(competitor)) {
		return `Elmo and ${name} are both open-source AI visibility tools you can self-host and audit. Elmo's focus is transparent, independently verifiable tracking across ChatGPT, Google AI Overviews and AI Mode, Gemini, Perplexity, Copilot, and Claude — with white-label support for agencies and a documented methodology behind every number.`;
	}

	const noun = CATEGORY_NOUN[competitor.category];
	return `Elmo is an open-source, self-hostable alternative to ${name}, ${indefiniteArticle(noun)} ${noun} tool. Both measure how AI answer engines describe your brand, but Elmo ships every line of code, runs on your own infrastructure, and is free to self-host — so your data stays yours and each metric is independently verifiable.`;
}

/**
 * Per-competitor FAQ generated from the competitor dataset. The same items are
 * rendered visibly on the page and emitted as FAQPage JSON-LD, so the structured
 * data always matches what a reader (or an AI crawler) sees. Every answer is
 * derived from fields we actually store, so it stays truthful per competitor.
 */
export function getComparisonFaqs(competitor: Competitor): FaqItem[] {
	const name = competitor.name;
	const openSource = isOpenSource(competitor);
	const noun = CATEGORY_NOUN[competitor.category];
	const faqs: FaqItem[] = [];

	if (competitor.slug === "getcito") {
		return [
			{
				question: `Should I use ${name} or Elmo?`,
				answer: `Use Elmo. ${name} has never had a mature codebase. It started as a minimal vibe-coded tracker, switched to a fork of Elmo on ${GETCITO_FORK_DATE}, and on ${GETCITO_REWRITE_DATE} threw the fork away for a new vibe-coded project that landed as a single, unreviewed 923,787-line commit. Elmo is mature and actively maintained.`,
			},
			{
				question: `What is the difference between Elmo and ${name}?`,
				answer: `Elmo is a mature codebase built in the open since July 2025, one reviewed change at a time. ${name}'s current code is a from-scratch, vibe-coded Next.js, Express, and Supabase project that replaced its Elmo fork on ${GETCITO_REWRITE_DATE} in one 4,354-file commit with no description and no review. Its original codebase was a minimal vibe-coded tracker, so neither of its own attempts has a track record.`,
			},
			{
				question: `Is ${name} a fork of Elmo?`,
				answer: `Not anymore. ${name} ran a fork of Elmo from ${GETCITO_FORK_DATE} until ${GETCITO_REWRITE_DATE}, when it replaced it with a new, vibe-coded codebase. Before the fork it was a minimal vibe-coded tracker, so this is its third codebase in a year.`,
			},
			{
				question: `Is ${name} open source?`,
				answer: `Yes, ${name} is MIT licensed. Its current code is a from-scratch rewrite merged on ${GETCITO_REWRITE_DATE}.`,
			},
			{
				question: `Is Elmo a free, open-source alternative to ${name}?`,
				answer: `Yes. Elmo is free to self-host under MIT, with unlimited prompts and every model, covering ChatGPT, Google AI Overviews and AI Mode, Gemini, Perplexity, Copilot, Claude, and more. Unlike ${name}, it has not been thrown out and rewritten twice in a year.`,
			},
		];
	}

	faqs.push({
		question: `What is the difference between Elmo and ${name}?`,
		answer: openSource
			? `Both Elmo and ${name} are open source, so you can self-host either one and inspect the code. Elmo focuses specifically on transparent, independently verifiable AI visibility tracking across every major answer engine, with white-label support for agencies and a fully documented methodology behind each number.`
			: `Elmo is an open-source, self-hostable AI visibility platform, while ${name} is a closed-source ${noun} tool. Both track how AI answer engines describe your brand, but Elmo gives you the full source code and runs on your own infrastructure, so you can verify every metric and keep your data in-house.`,
	});

	faqs.push({
		question: `Is Elmo a free, open-source alternative to ${name}?`,
		answer: `Yes. Elmo is a free, open-source alternative to ${name}. You can self-host the full platform at no cost, read every line of code, and track your AI visibility across ChatGPT, Google AI Overviews and AI Mode, Gemini, Perplexity, Copilot, Claude, and more without per-seat or per-prompt fees.`,
	});

	faqs.push({
		question: `Is ${name} open source?`,
		answer: openSource
			? `Yes, ${name} is open source. Elmo is open source as well and is built specifically for self-hosted, independently verifiable AI visibility tracking, so you can audit exactly how each metric is calculated.`
			: `No, ${name} is a hosted product without public source code. Elmo is fully open source, so you can read how each metric is calculated, self-host it on your own infrastructure, and take your data with you.`,
	});

	faqs.push({
		question: `How do Elmo and ${name} compare on sentiment analysis, API access, and MCP?`,
		answer: `Elmo includes all three: a 0 to 100 sentiment score for every AI answer that mentions you, a REST API with TypeScript and Python SDKs, and an MCP server so assistants like Claude Code and Cursor can query your data. ${integrationSummary(competitor)}`,
	});

	faqs.push({
		question: `Can I self-host Elmo instead of ${name}?`,
		answer: `Yes. Elmo is designed to be self-hosted — deploy it on your own infrastructure in minutes with the CLI. You keep full ownership of your data and prompts, with no per-seat pricing and no third-party dashboard holding your visibility history.`,
	});

	return faqs;
}
