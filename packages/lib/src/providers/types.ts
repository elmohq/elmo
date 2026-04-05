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
	model?: string;
}

export interface Provider {
	id: string;
	name: string;
	isConfigured(): boolean;
	supportedEngines(): string[];
	supportsWebSearchToggle(engine: string): boolean;
	run(engine: string, prompt: string, options?: ProviderOptions): Promise<ScrapeResult>;
	testConnection(engine: string): Promise<TestResult>;
}

export interface TestResult {
	success: boolean;
	latencyMs: number;
	error?: string;
	sampleOutput?: string;
}

export interface EngineConfig {
	engine: string;
	provider: string;
	model?: string;
	webSearch: boolean;
}
