/**
 * Provider-agnostic brand analysis. One direct-API LLM call (with web search
 * where the provider supports it) returns:
 *   - canonical brand name
 *   - additional brand domains (regional ccTLDs, alt spellings)
 *   - aliases (abbreviations, parent company names)
 *   - product/service categories
 *   - direct competitors (with their own domains/aliases)
 *   - suggested AI tracking prompts (with default tags)
 *
 * The Zod schema is the source of truth — `generateObject` derives a JSON
 * schema from it and hands it to the model, so the prompt itself only needs
 * to communicate context + quality guidelines, not field-by-field shape.
 */
import { z } from "zod";
import { getWebsiteExcerpt } from "../website-excerpt";
import { runStructuredResearchPrompt, resolveResearchTarget, type ResearchTarget } from "./llm";
import {
	cleanAndValidateDomain,
	cleanDomain,
	inferBrandNameFromDomain,
	uniqueLowercase,
	uniqueTrim,
} from "./utils";

const PROMPT_TAGS = [
	"comparison",
	"best-of",
	"alternative",
	"recommendation",
	"use-case",
	"branded",
	"transactional",
	"informational",
	"persona",
] as const;

const competitorSchema = z.object({
	name: z.string().describe("Company name"),
	domain: z
		.string()
		.describe(`Primary website hostname only — no protocol, no www, no path (e.g. "example.com")`),
	additionalDomains: z
		.array(z.string())
		.describe("Other domains the company owns (regional ccTLDs, alternate spellings)"),
	aliases: z.array(z.string()).describe("Other names the company is commonly known by"),
});

const promptSchema = z.object({
	prompt: z
		.string()
		.describe(
			'Short search-style fragment, lowercase, under ~12 words. NOT a full sentence — the kind of thing people actually type into ChatGPT.',
		),
	tags: z
		.array(z.enum(PROMPT_TAGS))
		.describe('1-2 tags categorizing the prompt. Always include "branded" when the prompt names the brand.'),
});

function buildSchema(args: { maxCompetitors: number; maxPrompts: number }) {
	return z.object({
		brandName: z.string().describe("Canonical brand name as commonly written (preserve casing)"),
		additionalDomains: z
			.array(z.string())
			.describe(
				"Other public domains the brand owns (regional ccTLDs, alternate spellings, parent-company sites). Hostnames only. Do not include the primary website. Empty if uncertain.",
			),
		aliases: z
			.array(z.string())
			.describe(
				"Other names users use for this brand (abbreviations, parent-company names, common misspellings). Empty if none are commonly used.",
			),
		products: z
			.array(z.string())
			.describe(
				'3-5 short generic product/service categories (lowercase, no brand names). E.g. for converse.com: ["sneakers", "casual shoes", "hi-tops"].',
			),
		competitors: z
			.array(competitorSchema)
			.describe(
				`Up to ${args.maxCompetitors} direct competitors that sell similar products to a similar audience. Empty if uncertain.`,
			),
		suggestedPrompts: z
			.array(promptSchema)
			.describe(
				`Up to ${args.maxPrompts} suggested AI tracking prompts. Mix shapes: "best [category]", "best [category] for [persona]", "[category] vs alternatives", "[brand] alternative", "where to buy [category]", "is [brand] worth it". Include 3-5 explicitly branded prompts.`,
			),
	});
}

type RawSuggestion = z.infer<ReturnType<typeof buildSchema>>;

export interface OnboardingCompetitor {
	name: string;
	domain: string;
	additionalDomains: string[];
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
	products: string[];
	competitors: OnboardingCompetitor[];
	suggestedPrompts: OnboardingPrompt[];
}

export interface AnalyzeBrandOptions {
	website: string;
	brandName?: string;
	includeCompetitors?: boolean;
	includePrompts?: boolean;
	maxCompetitors?: number;
	maxPrompts?: number;
	target?: ResearchTarget;
}

const DEFAULT_MAX_COMPETITORS = 10;
const DEFAULT_MAX_PROMPTS = 30;

export async function analyzeBrand(options: AnalyzeBrandOptions): Promise<OnboardingSuggestion> {
	const {
		website,
		brandName: providedBrandName,
		includeCompetitors = true,
		includePrompts = true,
		maxCompetitors = DEFAULT_MAX_COMPETITORS,
		maxPrompts = DEFAULT_MAX_PROMPTS,
		target,
	} = options;

	const normalizedWebsite = cleanDomain(website);
	if (!normalizedWebsite) {
		throw new Error(`Could not parse website "${website}"`);
	}

	const inferredName = providedBrandName?.trim() || inferBrandNameFromDomain(normalizedWebsite);
	const websiteExcerpt = await safeGetExcerpt(normalizedWebsite);
	const resolvedTarget = target ?? resolveResearchTarget();

	const prompt = buildPrompt({
		website: normalizedWebsite,
		brandNameHint: inferredName,
		websiteExcerpt,
		includeCompetitors,
		includePrompts,
	});

	const raw = await runStructuredResearchPrompt(prompt, {
		schema: buildSchema({ maxCompetitors, maxPrompts }),
		target: resolvedTarget,
	});

	return normalize({
		raw,
		website: normalizedWebsite,
		brandNameHint: inferredName,
		includeCompetitors,
		includePrompts,
		maxCompetitors,
		maxPrompts,
	});
}

async function safeGetExcerpt(website: string): Promise<string> {
	try {
		return await getWebsiteExcerpt(website);
	} catch (err) {
		console.warn(`[onboarding] website excerpt failed for ${website}:`, err);
		return "";
	}
}

function buildPrompt(args: {
	website: string;
	brandNameHint: string;
	websiteExcerpt: string;
	includeCompetitors: boolean;
	includePrompts: boolean;
}): string {
	const excerptBlock = args.websiteExcerpt
		? `\nText from ${args.website}:\n---\n${args.websiteExcerpt}\n---\n`
		: "\n";

	const skipNotes: string[] = [];
	if (!args.includeCompetitors) skipNotes.push("Return an empty array for competitors.");
	if (!args.includePrompts) skipNotes.push("Return an empty array for suggestedPrompts.");

	return `Analyze the brand at ${args.website}.

Likely brand name (from domain): ${args.brandNameHint}
${excerptBlock}
Use web search to verify facts. Never invent information — return empty arrays when uncertain. The output schema is enforced; just produce accurate values for each described field.${skipNotes.length > 0 ? `\n\n${skipNotes.join(" ")}` : ""}`;
}

function normalize(args: {
	raw: RawSuggestion;
	website: string;
	brandNameHint: string;
	includeCompetitors: boolean;
	includePrompts: boolean;
	maxCompetitors: number;
	maxPrompts: number;
}): OnboardingSuggestion {
	const { raw, website, brandNameHint, includeCompetitors, includePrompts, maxCompetitors, maxPrompts } = args;

	const brandName = (raw.brandName || brandNameHint).trim() || brandNameHint;

	const ownedDomains = new Set([website]);
	const additionalDomains = (raw.additionalDomains ?? [])
		.map((d) => cleanAndValidateDomain(d))
		.filter((d): d is string => d !== null && d !== website);
	for (const d of additionalDomains) ownedDomains.add(d);

	const dedupedAdditionalDomains = uniqueLowercase(additionalDomains);
	const aliases = uniqueTrim(raw.aliases ?? []).filter((a) => a.toLowerCase() !== brandName.toLowerCase());
	const products = uniqueLowercase(raw.products ?? []).slice(0, 8);

	const competitors: OnboardingCompetitor[] = [];
	if (includeCompetitors) {
		const seenDomains = new Set<string>();
		for (const c of raw.competitors ?? []) {
			if (competitors.length >= maxCompetitors) break;
			const primary = cleanAndValidateDomain(c.domain);
			if (!primary) continue;
			if (ownedDomains.has(primary)) continue;
			if (seenDomains.has(primary)) continue;
			seenDomains.add(primary);

			const extras = uniqueLowercase(
				(c.additionalDomains ?? [])
					.map((d) => cleanAndValidateDomain(d))
					.filter((d): d is string => d !== null && d !== primary && !ownedDomains.has(d)),
			);
			competitors.push({
				name: c.name.trim(),
				domain: primary,
				additionalDomains: extras,
				aliases: uniqueTrim(c.aliases ?? []),
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
			suggestedPrompts.push({ prompt: value, tags: uniqueLowercase(p.tags ?? []) });
		}
	}

	return {
		brandName,
		website,
		additionalDomains: dedupedAdditionalDomains,
		aliases,
		products,
		competitors,
		suggestedPrompts,
	};
}
