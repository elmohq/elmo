import type { ModelConfig } from "@workspace/config/scrape-targets";
import type { z } from "zod";
import type { Citation } from "../text-extraction";

// Canonical definition lives next to the SCRAPE_TARGETS parser in
// @workspace/config; re-exported here so provider code keeps importing it
// from "./types".
export type { ModelConfig };

export interface ProviderCallMetadata {
	providerRequestId?: string;
	inputTokens?: number;
	outputTokens?: number;
	webSearchRequests?: number;
}

export interface ScrapeResult {
	textContent: string;
	rawOutput: unknown;
	webQueries: string[];
	citations: Citation[];
	modelVersion?: string;
	providerCall?: ProviderCallMetadata;
}

export function parseProviderRequestId(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function parseProviderUsageInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export interface ProviderOptions {
	webSearch?: boolean;
	version?: string;
	/** Paid-request retries. Cloud v2 sets zero so every execution has its own durable attempt. */
	maxRetries?: number;
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
	/** Provider-request retries. AI SDK providers default to 2 when omitted. */
	maxRetries?: number;
	/**
	 * Maximum native-search tool uses within this request. Supplying this is a
	 * strict billing boundary: providers that cannot enforce it must reject the
	 * request instead of silently treating it as advisory.
	 */
	maxWebSearchUses?: number;
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
	structuredResearchCapabilities?: {
		/** The provider can enforce StructuredResearchOptions.maxWebSearchUses. */
		maxWebSearchUses: boolean;
	};
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
