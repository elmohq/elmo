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
