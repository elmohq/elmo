import type { Provider } from "./types";
import { olostep } from "./registry/olostep";
import { brightdata } from "./registry/brightdata";
import { openaiApi } from "./registry/openai-api";
import { anthropicApi } from "./registry/anthropic-api";
import { mistralApi } from "./registry/mistral-api";
import { dataforseo } from "./registry/dataforseo";
import { openrouter } from "./registry/openrouter";

export type {
	Provider,
	ScrapeResult,
	ProviderOptions,
	TestResult,
	ModelConfig,
	StructuredResearchOptions,
	StructuredResearchResult,
	StructuredResearchUsage,
} from "./types";
export { KNOWN_MODELS, getModelMeta } from "./models";
export type { ModelMeta } from "./models";
export { parseScrapeTargets, validateScrapeTargets } from "./config";
export { selectTargetsForBrand } from "./runner";

const providerMap: Record<string, Provider> = {
	olostep,
	brightdata,
	"openai-api": openaiApi,
	"anthropic-api": anthropicApi,
	"mistral-api": mistralApi,
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
