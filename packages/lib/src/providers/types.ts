import type { ModelConfig } from "@workspace/config/scrape-targets";
import type { z } from "zod";

export type { ModelConfig };

/** Text and citations are re-derived from `rawOutput` on every replay, so it must keep whatever extraction reads. */
export interface ScrapeResult {
	rawOutput: unknown;
	webQueries: string[];
	modelVersion?: string;
}

export interface ProviderOptions {
	webSearch?: boolean;
	version?: string;
}

export interface StructuredResearchOptions<T> {
	prompt: string;
	schema: z.ZodType<T>;
	/** Defaults to true. False for a single completion over context supplied in the prompt. */
	webSearch?: boolean;
}

export interface StructuredResearchResult<T> {
	object: T;
	/** After any `:online` suffixing. */
	modelVersion?: string;
}

/**
 * "scraped" reads back the consumer product, surface and all (ads, shopping,
 * the citations a user sees); "api" is the model's own answer, grounded only
 * when its search tool is on.
 */
export type ProviderAccess = "scraped" | "api";

export interface Provider {
	id: string;
	name: string;
	access: ProviderAccess;
	/** For a provider offering both paths, like DataForSEO, which uses its API when a target pins a version. */
	accessFor?(config: ModelConfig): ProviderAccess;
	/** Anchor in the provider setup guide; omitted by the test stub. */
	docsAnchor?: string;
	isConfigured(): boolean;
	run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult>;
	/** An error message for a target this provider can't serve. Omitted by providers that accept any model. */
	validateTarget?(config: ModelConfig): string | null;

	/** Direct API providers only; a deployment needs at least one. */
	runStructuredResearch?<T>(options: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>>;
}

export interface TestResult {
	success: boolean;
	latencyMs: number;
	error?: string;
	sampleOutput?: string;
}
