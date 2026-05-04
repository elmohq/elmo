import { z } from "zod";
import { getWebsiteExcerpt } from "./website-excerpt";
import { isPromptBranded } from "./tag-utils";
import { runStructuredResearchPrompt } from "./onboarding/llm";

export interface CompetitorResult {
	name: string;
	domain: string;
}

export interface PromptData {
	brandId: string;
	value: string;
	enabled: boolean;
	tags: string[];
	systemTags: string[];
}

// Generate candidate prompts for reports.
export async function generateCandidatePromptsForReports(
	brandName: string,
	brandWebsite: string,
	products: string[],
	competitors: CompetitorResult[],
): Promise<{ prompt: string; brandedPrompt: boolean }[]> {
	const productList = products.join(", ");
	const competitorNames = competitors.map((c) => c.name).join(", ");
	const websiteExcerpt = await getWebsiteExcerpt(brandWebsite);
	const excerptContext = websiteExcerpt
		? `\n\nWebsite excerpt:\n---\n${websiteExcerpt}\n---\n\n`
		: "\n";

	const prompt = `Generate a set of 70 short purchasing-decision prompts related to the brand ${brandName} (${brandWebsite}, sells ${productList}). The goal is for 14-28 of these prompts, when evaluated in ChatGPT/Claude/similar, to mention ${brandName} in the response. Ideally each prompt should also tend to surface a major competitor (${competitorNames}). Prompts should be short fragments, not full sentences, lowercase, in the style of "best X", "best X for Y", "good X alternative", "where to buy X". Most prompts should NOT include competitor names directly.

Then add 14 "fallback" branded prompts that contain "${brandName.toLowerCase()}" directly (e.g. "${brandName.toLowerCase()} alternatives", "best ${brandName.toLowerCase()} products"), guaranteed to surface the brand.${excerptContext}`;

	try {
		const result = await runStructuredResearchPrompt(
			prompt,
			z.object({
				prompts: z
					.array(
						z.object({
							prompt: z.string().describe("Lowercase short prompt fragment"),
						}),
					)
					.describe("84 prompts total: 70 unbranded + 14 branded fallbacks"),
			}),
		);

		const candidatePrompts = result.prompts
			.map((p) => p.prompt.trim())
			.filter((p) => p.length > 0)
			.map((p) => ({
				prompt: p.toLowerCase(),
				brandedPrompt: isPromptBranded(p, brandName, brandWebsite),
			}));

		if (candidatePrompts.length === 0) {
			throw new Error("LLM returned no candidate prompts");
		}

		console.log(
			`Generated ${candidatePrompts.length} candidate prompts (${candidatePrompts.filter((p) => p.brandedPrompt).length} branded)`,
		);
		return candidatePrompts;
	} catch (error) {
		console.error("Error generating candidate prompts:", error);
		throw error;
	}
}
