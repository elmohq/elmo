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
