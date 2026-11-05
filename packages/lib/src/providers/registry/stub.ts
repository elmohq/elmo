import type { Provider, ScrapeResult, StructuredResearchOptions, StructuredResearchResult } from "../types";

/**
 * Reachable only when a target names "stub" explicitly, as e2e and keyless local
 * development do. The canned result is validated against the caller's schema, so
 * drift fails loudly.
 */
const CANNED_RESEARCH = {
	brandName: "Stub Brand",
	additionalDomains: [] as string[],
	aliases: ["Stub"],
	competitors: [{ name: "Stub Competitor", domains: ["stub-competitor.example"], aliases: [] as string[] }],
	suggestedPrompts: [
		{ prompt: "best stub widgets", tags: ["stub"] },
		{ prompt: "stub brand alternative", tags: ["stub"] },
	],
};

export const stub: Provider = {
	id: "stub",
	name: "Stub (no network)",
	access: "api",

	isConfigured() {
		return true;
	},

	// Answers with the prompt itself, so a test chooses the answer the rest of the pipeline reads.
	async run(_model: string, prompt: string): Promise<ScrapeResult> {
		return { rawOutput: { answer_markdown: prompt }, webQueries: [], modelVersion: "stub" };
	},

	async runStructuredResearch<T>({ schema }: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>> {
		return { object: schema.parse(CANNED_RESEARCH), modelVersion: "stub" };
	},
};
