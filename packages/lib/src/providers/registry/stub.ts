import type { Provider, ScrapeResult, StructuredResearchOptions, StructuredResearchResult } from "../types";

/**
 * A no-network provider that returns a fixed, schema-valid research result.
 *
 * It is NOT part of any deployment's provider preference or default
 * SCRAPE_TARGETS — it is reachable only when an operator explicitly points
 * `ONBOARDING_LLM_TARGET` (or `SCRAPE_TARGETS`) at "stub". The e2e suite selects
 * it (`ONBOARDING_LLM_TARGET=stub:stub`) so the brand-analysis path
 * (`/api/v1/tools/analyze`, the onboarding wizard) runs end to end with no paid
 * LLM call; it's also handy for keyless local development.
 *
 * `runStructuredResearch` validates a canned object against the caller's schema,
 * so if the onboarding research schema changes and the canned shape drifts, the
 * mismatch surfaces as a loud parse error in tests rather than silent junk.
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
