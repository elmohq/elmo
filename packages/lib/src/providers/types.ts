import type { ModelConfig } from "@workspace/config/scrape-targets";
import type { z } from "zod";
import type { Citation } from "../text-extraction";

// Canonical definition lives next to the SCRAPE_TARGETS parser in
// @workspace/config; re-exported here so provider code keeps importing it
// from "./types".
export type { ModelConfig };

export interface ScrapeResult {
	textContent: string;
	rawOutput: unknown;
	webQueries: string[];
	citations: Citation[];
	modelVersion?: string;
}

export interface ProviderOptions {
	webSearch?: boolean;
	version?: string;
}

export interface StructuredResearchOptions<T> {
	prompt: string;
	schema: z.ZodType<T>;
	/**
	 * Whether the model may use its web-search tool. Defaults to true (the
	 * onboarding research path). Set false for a single completion over context
	 * supplied entirely in the prompt — no tools, no agent loop.
	 */
	webSearch?: boolean;
}

export interface StructuredResearchResult<T> {
	object: T;
	/** Resolved model id (after any `:online` suffixing etc.). */
	modelVersion?: string;
}

/**
 * How a provider reaches the model, which is what a customer is really choosing
 * between:
 *  - "scraped": the consumer product is driven and its rendered answer read
 *    back, so results include the surrounding surface (ads, shopping modules,
 *    the citation list a real user sees).
 *  - "api": the model is called directly, so results are the model's own answer
 *    with no consumer chrome, and web grounding only happens when the model has
 *    a search tool and it is switched on.
 */
export type ProviderAccess = "scraped" | "api";

export interface Provider {
	id: string;
	name: string;
	/** How this provider reaches models, for targets that don't refine it. */
	access: ProviderAccess;
	/**
	 * Per-target refinement, for a provider that offers both paths. DataForSEO
	 * scrapes a surface by default but routes to its LLM Responses API when a
	 * target pins a model version, so the same provider is either depending on
	 * the target.
	 */
	accessFor?(config: ModelConfig): ProviderAccess;
	/**
	 * Section of the provider setup guide covering this provider, so the app can
	 * point an operator at how to configure it. Omitted for providers with no
	 * public setup docs (the stub used by tests).
	 */
	docsAnchor?: string;
	isConfigured(): boolean;
	run(model: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult>;
	/** Validate a target config. Returns an error message if invalid, null if valid.
	 *  Omit for providers that accept any model (runtime validation only). */
	validateTarget?(config: ModelConfig): string | null;

	/**
	 * Run a single research call that returns a Zod-validated structured value.
	 * Each direct API provider implements this using the most idiomatic combo.
	 * Scraper providers don't implement this, and at least one direct api
	 * provider is required.
	 */
	runStructuredResearch?<T>(options: StructuredResearchOptions<T>): Promise<StructuredResearchResult<T>>;
}

export interface TestResult {
	success: boolean;
	latencyMs: number;
	error?: string;
	sampleOutput?: string;
}
