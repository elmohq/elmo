/**
 * More tracking prompts for a brand that already has some — the onboarding
 * suggestions again, steered away from what the brand already tracks.
 */
import { z } from "zod";
import { dedupeKey } from "../bulk-prompts";
import {
	normalizePrompts,
	type OnboardingPrompt,
	promptMixGuidance,
	promptSchema,
	safeGetExcerpt,
	TAG_GUIDANCE,
	websiteExcerptBlock,
} from "./analyze";
import { runStructuredResearchPrompt } from "./llm";
import { cleanDomain, cleanUrl } from "./utils";

export interface SuggestPromptsOptions {
	website: string;
	brandName: string;
	/** Prompts the brand tracks or the user has already seen; none come back. */
	existingPrompts: string[];
	/** Tags already in use, so new prompts land in the same vocabulary. */
	existingTags?: string[];
	competitors?: string[];
	count?: number;
}

const DEFAULT_COUNT = 5;

function buildSchema(count: number) {
	return z.object({
		suggestedPrompts: z
			.array(promptSchema)
			.describe(`Exactly ${count} NEW AI tracking prompts. ${promptMixGuidance("At most 2")} ${TAG_GUIDANCE}`),
	});
}

function buildPrompt(args: {
	analysisUrl: string;
	brandName: string;
	websiteExcerpt: string;
	existingPrompts: string[];
	existingTags: string[];
	competitors: string[];
	count: number;
}): string {
	const excerptBlock = websiteExcerptBlock(args.analysisUrl, args.websiteExcerpt);
	const competitorsLine =
		args.competitors.length > 0 ? `\nCompetitors already tracked: ${args.competitors.join(", ")}\n` : "";
	const tagsLine =
		args.existingTags.length > 0
			? `\nTags already in use (reuse these where they fit rather than inventing near-synonyms): ${args.existingTags.join(", ")}\n`
			: "";
	const existingBlock =
		args.existingPrompts.length > 0
			? `\nPrompts the brand already has — do NOT repeat these, reword them, or return trivial variants (plurals, reordered words, swapped synonyms):\n${args.existingPrompts.map((p) => `- ${p}`).join("\n")}\n`
			: "";

	return `Suggest ${args.count} more AI tracking prompts for ${args.brandName} (${args.analysisUrl}).
${excerptBlock}${competitorsLine}${tagsLine}${existingBlock}
Each prompt is something a real person would type into ChatGPT where an answer could plausibly mention ${args.brandName} or its competitors. Use web search to understand what the brand sells and who buys it, then cover angles the existing prompts miss: other product categories, audiences, use cases, price points, regions, or buying stages.`;
}

/**
 * New prompts only: anything matching an existing prompt (ignoring case and
 * spacing) is dropped even if the model repeats it, so the result can be
 * shorter than `count`.
 */
export async function suggestPrompts(options: SuggestPromptsOptions): Promise<OnboardingPrompt[]> {
	const count = options.count ?? DEFAULT_COUNT;
	const analysisUrl = cleanUrl(options.website);
	if (!cleanDomain(options.website) || !analysisUrl) {
		throw new Error(`Could not parse website "${options.website}"`);
	}

	const prompt = buildPrompt({
		analysisUrl,
		brandName: options.brandName,
		websiteExcerpt: await safeGetExcerpt(analysisUrl),
		existingPrompts: options.existingPrompts,
		existingTags: options.existingTags ?? [],
		competitors: options.competitors ?? [],
		count,
	});
	const raw = await runStructuredResearchPrompt(prompt, buildSchema(count));

	const existing = new Set(options.existingPrompts.map(dedupeKey));
	return normalizePrompts(
		raw.suggestedPrompts.filter((p) => !existing.has(dedupeKey(p.prompt))),
		count,
	);
}
