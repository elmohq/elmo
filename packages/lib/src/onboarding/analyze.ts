/**
 * Provider-agnostic brand analysis. One direct-API LLM call (with web search
 * where the provider supports it) returns:
 *   - canonical brand name
 *   - additional brand domains (regional ccTLDs, alt spellings)
 *   - aliases (abbreviations, parent company names)
 *   - direct competitors (with their own domains/aliases)
 *   - suggested AI tracking prompts (with default tags)
 *
 * The Zod schema is the source of truth — `generateObject` derives a JSON
 * schema from it and hands it to the model, so the prompt itself only needs
 * to communicate context + quality guidelines, not field-by-field shape.
 */
import { z } from "zod";
import { getWebsiteExcerpt } from "../website-excerpt";
import { runStructuredResearchPrompt } from "./llm";
import {
	cleanAndValidateDomain,
	cleanDomain,
	cleanUrl,
	inferBrandNameFromDomain,
	uniqueLowercase,
	uniqueTrim,
} from "./utils";

// Tags are free-form and brand-tailored: the LLM invents a small vocabulary
// (≤5 distinct values) that's actually useful for filtering THIS brand's
// prompts. No tag values are hardcoded here — the LLM picks the entire
// vocabulary from the brand context.
const TAG_GUIDANCE =
	"Tags should be tailored to this specific brand and the prompt set you're producing. Aim for tags that describe WHAT a prompt is about (a product category, audience segment, sub-feature, competitor name) — not WHAT the user wants to do with the answer (compare, evaluate, buy). Goal-style intent tags tend to apply to most prompts in the set and don't discriminate. Prefer single-word tags; only use multi-word tags (lowercase, single hyphens between words) when no single word captures the concept. Each tag should describe ONE axis — don't fuse two ideas into a compound hyphenated label. Don't use 'branded' or 'unbranded' as tag values; the system computes that classification automatically from the prompt text. Pick a small shared vocabulary (no more than 5 distinct values across all prompts), and only attach a tag to a prompt if it actually discriminates that prompt from others — if the same tag would apply to most prompts, don't use it.";

const ALIAS_GUIDANCE =
	'Skip variants that contain the canonical name as a substring (e.g. don\'t add "Asics America" for "Asics" — substring matching catches it already). DO include genuinely distinct names like parent companies or sub-brands the company owns (e.g. "Converse" for Nike).';

const competitorSchema = z.object({
	name: z.string().describe("Company name"),
	domains: z
		.array(z.string())
		.describe(
			`All domains owned by this company — hostnames only, no protocol, no www, no path (e.g. "example.com"). Include the primary website plus any regional ccTLDs or alternate spellings the company also uses. At least one domain.`,
		),
	aliases: z.array(z.string()).describe(`Other names the company is commonly known by. ${ALIAS_GUIDANCE}`),
});

const promptSchema = z.object({
	prompt: z
		.string()
		.describe(
			"Short search-style fragment, lowercase, under ~12 words. NOT a full sentence — the kind of thing people actually type into ChatGPT.",
		),
	tags: z
		.array(z.string())
		.describe(`1-3 tags per prompt (ideally 1-2), drawn from the shared brand-tailored vocabulary. ${TAG_GUIDANCE}`),
});

function buildSchema(args: { maxCompetitors: number; maxPrompts: number }) {
	return z.object({
		brandName: z
			.string()
			.describe(
				'Canonical brand name in plaintext (preserve casing, but no markdown — no links, no formatting, just the bare name). The brandName must be searchable, because mention-detection matches it as a substring of AI answers. Don\'t include legal entity suffixes like "Inc." or "Ltd." When the page is a sub-brand, product line, or regional arm of a larger company, name THAT (e.g. "Nike Golf" for nike.com/golf) rather than the parent — otherwise use the name the hostname is built around (for nike.com, "Nike").',
			),
		additionalDomains: z
			.array(z.string())
			.describe(
				"Other public domains the brand owns (regional ccTLDs, alternate spellings, parent-company sites). Hostnames only. Do not include the primary website. Empty if uncertain.",
			),
		aliases: z
			.array(z.string())
			.describe(
				`Other names users use for this brand (abbreviations, parent-company names, common misspellings). ${ALIAS_GUIDANCE} Empty if none are commonly used.`,
			),
		competitors: z
			.array(competitorSchema)
			.describe(
				`Up to ${args.maxCompetitors} direct competitors that sell similar products to a similar audience. Empty if uncertain.`,
			),
		suggestedPrompts: z
			.array(promptSchema)
			.describe(
				`Up to ${args.maxPrompts} suggested AI tracking prompts. IMPORTANT: the MAJORITY must be UNBRANDED — generic category/persona queries that do NOT contain the brand name (e.g. "best [category]", "best [category] for [persona]", "[category] vs alternatives", "where to buy [category]"). Only 3-5 should be branded (contain the brand name, e.g. "[brand] alternative", "is [brand] worth it"). The goal is to test whether AI models mention the brand organically in response to unbranded queries. ${TAG_GUIDANCE}`,
			),
	});
}

type RawSuggestion = z.infer<ReturnType<typeof buildSchema>>;

export interface OnboardingCompetitor {
	name: string;
	domains: string[];
	aliases: string[];
}

export interface OnboardingPrompt {
	prompt: string;
	tags: string[];
}

export interface OnboardingSuggestion {
	brandName: string;
	website: string;
	additionalDomains: string[];
	aliases: string[];
	competitors: OnboardingCompetitor[];
	suggestedPrompts: OnboardingPrompt[];
}

export interface AnalyzeBrandOptions {
	/**
	 * Brand website — a domain or a full URL. A URL with a path (e.g.
	 * `https://www.nike.com/golf`) is researched as given, so a sub-brand can be
	 * analyzed from its own section of a larger site; the identity mentions are
	 * tracked against is always its hostname.
	 */
	website: string;
	brandName?: string;
	/** 0 disables competitor generation entirely. */
	maxCompetitors?: number;
	/** 0 disables prompt generation entirely. */
	maxPrompts?: number;
}

const DEFAULT_MAX_COMPETITORS = 10;
const DEFAULT_MAX_PROMPTS = 30;

/**
 * Resolved inputs for one analysis run: the prompt the LLM sees, the schema
 * its output is validated against, and the post-processing inputs the
 * normalizer needs. Built once and reused across providers in the
 * compare-onboarding script so every provider sees identical input.
 */
export interface AnalysisContext {
	/** Host-only identity used by downstream mention and citation matching. */
	website: string;
	/** Full URL the excerpt was read from and the prompt is written about. */
	analysisUrl: string;
	brandNameHint: string;
	/** Caller-supplied name, when there was one — it outranks the model's answer. */
	providedBrandName?: string;
	prompt: string;
	schema: ReturnType<typeof buildSchema>;
	maxCompetitors: number;
	maxPrompts: number;
}

export async function buildAnalysisContext(options: AnalyzeBrandOptions): Promise<AnalysisContext> {
	const { website, brandName, maxCompetitors = DEFAULT_MAX_COMPETITORS, maxPrompts = DEFAULT_MAX_PROMPTS } = options;

	const normalizedWebsite = cleanDomain(website);
	const analysisUrl = cleanUrl(website);
	if (!normalizedWebsite || !analysisUrl) {
		throw new Error(`Could not parse website "${website}"`);
	}

	const providedBrandName = brandName?.trim() || undefined;
	const brandNameHint = providedBrandName ?? inferBrandNameFromDomain(normalizedWebsite);
	const websiteExcerpt = await safeGetExcerpt(analysisUrl);

	const prompt = buildPrompt({
		analysisUrl,
		trackedDomain: normalizedWebsite,
		brandNameHint,
		brandNameWasProvided: providedBrandName !== undefined,
		websiteExcerpt,
		includeCompetitors: maxCompetitors > 0,
		includePrompts: maxPrompts > 0,
	});

	return {
		website: normalizedWebsite,
		analysisUrl,
		brandNameHint,
		...(providedBrandName !== undefined && { providedBrandName }),
		prompt,
		schema: buildSchema({ maxCompetitors, maxPrompts }),
		maxCompetitors,
		maxPrompts,
	};
}

export function normalizeAnalysisResult(raw: RawSuggestion, ctx: AnalysisContext): OnboardingSuggestion {
	return normalize({
		raw,
		website: ctx.website,
		brandNameHint: ctx.brandNameHint,
		...(ctx.providedBrandName !== undefined && { providedBrandName: ctx.providedBrandName }),
		includeCompetitors: ctx.maxCompetitors > 0,
		includePrompts: ctx.maxPrompts > 0,
		maxCompetitors: ctx.maxCompetitors,
		maxPrompts: ctx.maxPrompts,
	});
}

export async function analyzeBrand(options: AnalyzeBrandOptions): Promise<OnboardingSuggestion> {
	const start = Date.now();
	console.log(`[onboarding] analyzeBrand start: ${options.website}`);
	const ctx = await buildAnalysisContext(options);
	const raw = await runStructuredResearchPrompt(ctx.prompt, ctx.schema);
	const result = normalizeAnalysisResult(raw, ctx);
	console.log(
		`[onboarding] analyzeBrand done: ${ctx.analysisUrl} in ${Date.now() - start}ms (tracking="${result.website}", brand="${result.brandName}", competitors=${result.competitors.length}, prompts=${result.suggestedPrompts.length})`,
	);
	return result;
}

/** Normalize an LLM-supplied tag to lowercase kebab-case. */
function toKebabCase(tag: string): string {
	return tag
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Drop aliases that contain the canonical name as a substring — mention
 * detection is case-insensitive substring matching, so any text matching
 * such an alias also matches the canonical name. Keeping them just bloats
 * the alias list. (See worker/src/jobs/process-prompt.ts: analyzeMentions.)
 */
function filterRedundantAliases(aliases: string[], canonicalName: string): string[] {
	const canonical = canonicalName.trim().toLowerCase();
	if (!canonical) return aliases;
	return aliases.filter((a) => !a.toLowerCase().includes(canonical));
}

async function safeGetExcerpt(website: string): Promise<string> {
	try {
		return await getWebsiteExcerpt(website);
	} catch (err) {
		console.warn(`[onboarding] website excerpt failed for ${website}:`, err);
		return "";
	}
}

/** A URL pointing at something narrower than the site as a whole. */
function isSubPage(analysisUrl: string): boolean {
	try {
		const url = new URL(analysisUrl);
		return url.pathname !== "/" || url.search !== "" || url.hash !== "";
	} catch {
		return false;
	}
}

function buildPrompt(args: {
	analysisUrl: string;
	trackedDomain: string;
	brandNameHint: string;
	brandNameWasProvided: boolean;
	websiteExcerpt: string;
	includeCompetitors: boolean;
	includePrompts: boolean;
}): string {
	const excerptBlock = args.websiteExcerpt
		? `\nText from ${args.analysisUrl}:\n---\n${args.websiteExcerpt}\n---\n`
		: "\n";

	const nameLine = args.brandNameWasProvided
		? `Brand name (given by the user — keep it; correct only formatting): ${args.brandNameHint}`
		: `Likely brand name (from domain): ${args.brandNameHint}`;

	// A page below the site root is usually a sub-brand, product line, or
	// regional arm. Everything should describe that, not the company that
	// happens to own the domain — the domain only sets what mentions match.
	const scopeNote = isSubPage(args.analysisUrl)
		? `\nThis is one page on ${args.trackedDomain}, not the site root. If it covers a sub-brand, product line, or regional arm, scope the brand name, competitors, and prompts to THAT rather than to the parent company.\n`
		: "";

	const skipNotes: string[] = [];
	if (!args.includeCompetitors) skipNotes.push("Return an empty array for competitors.");
	if (!args.includePrompts) skipNotes.push("Return an empty array for suggestedPrompts.");

	return `Analyze the brand at ${args.analysisUrl}.

${nameLine}
${scopeNote}${excerptBlock}
Use web search to verify facts. Never invent information — return empty arrays when uncertain.

You MUST return the structured JSON object — even if you can find nothing about this brand. In that case set brandName to the likely name above and return empty arrays for every other field. Refusing to produce JSON, or replying with prose explaining what you don't know, is a failure mode; an object with mostly-empty arrays is the correct answer when information is genuinely unavailable.${skipNotes.length > 0 ? `\n\n${skipNotes.join(" ")}` : ""}`;
}

function normalize(args: {
	raw: RawSuggestion;
	website: string;
	brandNameHint: string;
	providedBrandName?: string;
	includeCompetitors: boolean;
	includePrompts: boolean;
	maxCompetitors: number;
	maxPrompts: number;
}): OnboardingSuggestion {
	const {
		raw,
		website,
		brandNameHint,
		providedBrandName,
		includeCompetitors,
		includePrompts,
		maxCompetitors,
		maxPrompts,
	} = args;

	// A caller-supplied name wins: it's what the user asked to track, and for a
	// sub-brand the model tends to answer with the parent it recognises
	// ("Nike Golf" → "Nike"), which would silently widen every match.
	const brandName = providedBrandName ?? ((raw.brandName || brandNameHint).trim() || brandNameHint);

	const ownedDomains = new Set([website]);
	const additionalDomains = (raw.additionalDomains ?? [])
		.map((d) => cleanAndValidateDomain(d))
		.filter((d): d is string => d !== null && d !== website);
	for (const d of additionalDomains) ownedDomains.add(d);

	const dedupedAdditionalDomains = uniqueLowercase(additionalDomains);
	const aliases = filterRedundantAliases(uniqueTrim(raw.aliases ?? []), brandName);

	const competitors: OnboardingCompetitor[] = [];
	if (includeCompetitors) {
		const seenCompetitorDomains = new Set<string>();
		for (const c of raw.competitors ?? []) {
			if (competitors.length >= maxCompetitors) break;
			const cleaned = uniqueLowercase(
				(c.domains ?? [])
					.map((d) => cleanAndValidateDomain(d))
					.filter((d): d is string => d !== null && !ownedDomains.has(d)),
			);
			if (cleaned.length === 0) continue;
			// Dedupe at the competitor level: if any of this competitor's domains
			// already belong to a competitor we kept, skip the whole entry.
			if (cleaned.some((d) => seenCompetitorDomains.has(d))) continue;
			for (const d of cleaned) seenCompetitorDomains.add(d);

			const compName = c.name.trim();
			competitors.push({
				name: compName,
				domains: cleaned,
				aliases: filterRedundantAliases(uniqueTrim(c.aliases ?? []), compName),
			});
		}
	}

	const suggestedPrompts: OnboardingPrompt[] = [];
	if (includePrompts) {
		const seen = new Set<string>();
		for (const p of raw.suggestedPrompts ?? []) {
			if (suggestedPrompts.length >= maxPrompts) break;
			const value = p.prompt.trim().toLowerCase();
			if (!value || seen.has(value)) continue;
			seen.add(value);
			const tags = uniqueLowercase((p.tags ?? []).map(toKebabCase).filter(Boolean)).slice(0, 3);
			suggestedPrompts.push({ prompt: value, tags });
		}
	}

	return {
		brandName,
		website,
		additionalDomains: dedupedAdditionalDomains,
		aliases,
		competitors,
		suggestedPrompts,
	};
}
