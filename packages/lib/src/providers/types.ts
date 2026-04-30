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
	/** Override the provider's `defaultResearchModel`. */
	model?: string;
}

export interface Provider {
	id: string;
	name: string;
	isConfigured(): boolean;
	run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult>;
	/** Validate a target config. Returns an error message if invalid, null if valid.
	 *  Omit for providers that accept any model (runtime validation only). */
	validateTarget?(config: ModelConfig): string | null;

	// ----- research / onboarding capabilities --------------------------------

	/**
	 * Default model id this provider should use for research-style work (brand
	 * onboarding, ad-hoc LLM tasks). Only set on direct API providers that
	 * implement `runStructuredResearch`.
	 */
	defaultResearchModel?: string;
	/**
	 * Run a single research call that returns a Zod-validated structured value.
	 * Each direct API provider implements this using the most idiomatic combo
	 * for its API: `generateText` + web-search tool + `experimental_output`
	 * for Anthropic/OpenAI; `generateObject` against a `:online`-suffixed slug
	 * for OpenRouter; OpenAI-compat `generateObject` for Mistral. Screen-
	 * scraper providers (Olostep / BrightData) don't implement this — the
	 * onboarding flow always picks a direct API provider.
	 */
	runStructuredResearch?<T>(options: StructuredResearchOptions<T>): Promise<T>;
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
