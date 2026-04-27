import type { LanguageModel } from "ai";
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
	 * Default model id this provider should use when called for research-style
	 * work (e.g. brand onboarding analysis). Set on every provider that's
	 * eligible for that path; omit on providers we never want to use for it.
	 */
	defaultResearchModel?: string;
	/**
	 * Returns an AI SDK LanguageModel instance for native structured-output
	 * calls (e.g. `generateObject({ model, schema })`). Only direct API
	 * providers implement this — screen-scraper providers (Olostep / BrightData)
	 * leave it unset, and the onboarding pipeline falls back to running the
	 * provider's normal `run()` and parsing JSON out of the chatbot's reply.
	 */
	languageModel?(model?: string): LanguageModel;
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
