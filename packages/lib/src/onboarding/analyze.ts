/**
 * Provider-agnostic brand analysis. One LLM round-trip produces:
 *   - canonical brand name
 *   - additional brand domains (regional ccTLDs, alt spellings)
 *   - aliases (abbreviations, parent company names)
 *   - product/service categories
 *   - direct competitors (with their own domains/aliases)
 *   - suggested AI tracking prompts (with default tags)
 *
 * The structured output is the new heart of onboarding — both the in-app
 * wizard and the public `/api/v1/onboarding/*` endpoints consume it. The
 * legacy DataForSEO-driven keyword/persona helpers in `wizard-helpers.ts`
 * stay for the report worker but no longer block onboarding.
 */
import { z } from "zod";
import type { ModelConfig } from "../providers";
import { getWebsiteExcerpt } from "../website-excerpt";
import { runStructuredResearchPrompt, resolveOnboardingTarget } from "./llm";
import {
	cleanAndValidateDomain,
	cleanDomain,
	inferBrandNameFromDomain,
	uniqueLowercase,
	uniqueTrim,
} from "./utils";

const ALLOWED_TAGS = new Set([
	"comparison",
	"best-of",
	"alternative",
	"recommendation",
	"use-case",
	"branded",
	"transactional",
	"informational",
	"persona",
]);

const competitorSchema = z.object({
	name: z.string().min(1),
	domain: z.string().min(1),
	additionalDomains: z.array(z.string()).optional().default([]),
	aliases: z.array(z.string()).optional().default([]),
});

const promptSchema = z.object({
	prompt: z.string().min(1),
	tags: z.array(z.string()).optional().default([]),
});

const onboardingSuggestionSchema = z.object({
	brandName: z.string().optional(),
	additionalDomains: z.array(z.string()).optional().default([]),
	aliases: z.array(z.string()).optional().default([]),
	products: z.array(z.string()).optional().default([]),
	competitors: z.array(competitorSchema).optional().default([]),
	suggestedPrompts: z.array(promptSchema).optional().default([]),
});

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
	target?: ModelConfig;
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

	const prompt = buildAnalysisPrompt({
		website: normalizedWebsite,
		brandNameHint: inferredName,
		websiteExcerpt,
		includeCompetitors,
		includePrompts,
		maxCompetitors,
		maxPrompts,
	});

	const resolvedTarget = target ?? resolveOnboardingTarget();
	const raw = await runStructuredResearchPrompt(prompt, {
		schema: onboardingSuggestionSchema,
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

function buildAnalysisPrompt(args: {
	website: string;
	brandNameHint: string;
	websiteExcerpt: string;
	includeCompetitors: boolean;
	includePrompts: boolean;
	maxCompetitors: number;
	maxPrompts: number;
}): string {
	const {
		website,
		brandNameHint,
		websiteExcerpt,
		includeCompetitors,
		includePrompts,
		maxCompetitors,
		maxPrompts,
	} = args;

	const excerptBlock = websiteExcerpt
		? `\nText extracted from ${website} (first 200 lines):\n---\n${websiteExcerpt}\n---\n`
		: "\n";

	const competitorsSection = includeCompetitors
		? `5. competitors: up to ${maxCompetitors} direct competitors that sell similar products to a similar audience. For each: { name, domain, additionalDomains?, aliases? }. Domains MUST be plain hostnames (no protocol, no www, no path). Only include competitors you are confident in — return [] when unsure.`
		: `5. competitors: return an empty array.`;

	const promptsSection = includePrompts
		? `6. suggestedPrompts: up to ${maxPrompts} short search-style prompts a real user might type into ChatGPT/Claude/Gemini, where the brand or its competitors might plausibly be mentioned. Vary the shape across:
   - "best [category]"
   - "best [category] for [persona/use-case]"
   - "[category] vs alternatives"
   - "${brandNameHint.toLowerCase()} alternative" / "alternatives to ${brandNameHint.toLowerCase()}"
   - "where to buy [category]"
   - "is [brand] worth it" / "[brand] review"
   - 3-5 branded prompts that contain the brand name directly
   Each: { prompt, tags }. Prompt MUST be short (under ~12 words), lowercase, NOT a full sentence — the kind of fragment people actually type into search/AI. Tags MUST be 1-2 entries chosen from this exact list: comparison, best-of, alternative, recommendation, use-case, branded, transactional, informational, persona. If a prompt mentions the brand by name, include "branded".`
		: `6. suggestedPrompts: return an empty array.`;

	return `You are a brand intelligence assistant helping configure AI visibility tracking for a brand.

Brand under analysis:
- Website: ${website}
- Likely brand name (from domain): ${brandNameHint}
${excerptBlock}
Use web search if available to verify facts. Never invent information — return empty arrays when uncertain.

Produce a single JSON object describing this brand:
1. brandName: canonical brand name as commonly written (preserve casing).
2. additionalDomains: other public domains the brand owns (regional ccTLDs, alternate spellings, parent-company sites). Plain hostnames only — no protocol, no www, no path. Do NOT include the primary website (${website}). Only include domains you are highly confident the brand owns; if uncertain, return [].
3. aliases: other names users might use for this brand (abbreviations, parent-company names, common misspellings). Lowercase strings. Only include if commonly used; otherwise return [].
4. products: 3-5 short, generic product/service categories (lowercase, no brand names). For example, for converse.com: ["sneakers","casual shoes","hi-tops"].
${competitorsSection}
${promptsSection}

Return ONLY a single JSON object inside <out>...</out>. No commentary outside the tags.

Example output shape (do NOT copy these values):
<out>
{
  "brandName": "Acme",
  "additionalDomains": ["acme.co.uk"],
  "aliases": ["acme inc", "acme corporation"],
  "products": ["widgets", "industrial supplies"],
  "competitors": [
    { "name": "Globex", "domain": "globex.com", "additionalDomains": ["globex.de"], "aliases": ["globex corp"] }
  ],
  "suggestedPrompts": [
    { "prompt": "best widgets", "tags": ["best-of"] },
    { "prompt": "acme alternative", "tags": ["alternative", "branded"] }
  ]
}
</out>`;
}

function normalize(args: {
	raw: z.infer<typeof onboardingSuggestionSchema>;
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
			const tags = uniqueLowercase(p.tags ?? []).filter((t) => ALLOWED_TAGS.has(t));
			suggestedPrompts.push({ prompt: value, tags });
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
