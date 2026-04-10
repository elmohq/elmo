import type { Provider } from "./types";
import { olostep } from "./olostep";
import { brightdata } from "./brightdata";
import { openaiApi } from "./openai-api";
import { anthropicApi } from "./anthropic-api";
import { dataforseo } from "./dataforseo";
import { openrouter } from "./openrouter";

export type { Provider, ScrapeResult, ProviderOptions, TestResult, ModelConfig } from "./types";
export { KNOWN_MODELS, getModelMeta } from "./models";
export type { ModelMeta } from "./models";
export { parseScrapeTargets, validateScrapeTargets } from "./config";

const providerMap: Record<string, Provider> = {
	olostep,
	brightdata,
	"openai-api": openaiApi,
	"anthropic-api": anthropicApi,
	dataforseo,
	openrouter,
};

export function getProvider(id: string): Provider {
	const p = providerMap[id];
	if (!p) throw new Error(`Unknown provider: "${id}"`);
	return p;
}

export function getAvailableProviders(): Provider[] {
	return Object.values(providerMap).filter((p) => p.isConfigured());
}

export function getAllProviders(): Provider[] {
	return Object.values(providerMap);
}
