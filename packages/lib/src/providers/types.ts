import type { z } from "zod";
import type { Citation } from "../text-extraction";

export interface ScrapeResult {
	textContent: string;
	rawOutput: unknown;
	webQueries: string[];
	citations: Citation[];
	modelVersion?: string;
}

export interface ProviderOptions {
	webSearch?: boolean;
	country?: string;
	version?: string;
}

export interface StructuredResearchOptions<T> {
	prompt: string;
	schema: z.ZodType<T>;
}

export interface StructuredResearchResult<T> {
	object: T;
	/** Resolved model id (after any `:online` suffixing etc.). */
	modelVersion?: string;
}

export interface Provider {
	id: string;
	name: string;
	isConfigured(): boolean;
	run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult>;
	/** Validate a target config. Returns an error message if invalid, null if valid.
	 *  Omit for providers that accept any model (runtime validation only). */
	validateTarget?(config: ModelConfig): string | null;

	/**
	 * Run a single research call that returns a Zod-validated structured value.
	 * Each direct API provider implements this using the most idiomatic combo
	 * for its API: `generateText` + web-search tool + `experimental_output`
	 * for Anthropic/OpenAI; raw fetch + `plugins:[{web,native}]` for OpenRouter;
	 * raw fetch + `/v1/conversations` + web_search for Mistral. Screen-scraper
	 * providers (Olostep / BrightData) don't implement this — the onboarding
	 * flow always picks a direct API provider. The optional `model` argument
	 * overrides the provider's internal default.
	 */
	runStructuredResearch?<T>(options: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>>;
}

export interface TestResult {
	success: boolean;
	latencyMs: number;
	error?: string;
	sampleOutput?: string;
}

export interface ModelConfig {
	model: string;
	provider: string;
	version?: string;
	webSearch: boolean;
}
