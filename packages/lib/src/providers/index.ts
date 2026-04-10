import type { Provider } from "./types";
import { olostep } from "./registry/olostep";
import { brightdata } from "./registry/brightdata";
import { openaiApi } from "./registry/openai-api";
import { anthropicApi } from "./registry/anthropic-api";
import { dataforseo } from "./registry/dataforseo";
import { openrouter } from "./registry/openrouter";

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

/**
 * Resolve a provider ID, handling any aliases.
 * Currently a pass-through, but allows SCRAPE_TARGETS configs
 * to be resolved consistently before calling getProvider().
 */
export function resolveProviderId(providerId: string, _model: string): string {
	return providerId;
}

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
