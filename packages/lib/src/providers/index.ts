import { anthropicApi } from "./registry/anthropic-api";
import { brightdata } from "./registry/brightdata";
import { cloro } from "./registry/cloro";
import { dataforseo } from "./registry/dataforseo";
import { mistralApi } from "./registry/mistral-api";
import { olostep } from "./registry/olostep";
import { openaiApi } from "./registry/openai-api";
import { openrouter } from "./registry/openrouter";
import { oxylabs } from "./registry/oxylabs";
import { stub } from "./registry/stub";
import type { Provider } from "./types";

export { STATUS_TARGETS } from "@workspace/config/scrape-targets";
export { getTrackingTargetKey, parseScrapeTargets, validateScrapeTargets } from "./config";
export type { ModelMeta } from "./models";
export { getModelMeta, KNOWN_MODELS } from "./models";
export { selectTargetsForBrand } from "./runner";
export type {
	ModelConfig,
	Provider,
	ProviderCallMetadata,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
	TestResult,
} from "./types";

const providerMap: Record<string, Provider> = {
	olostep,
	brightdata,
	oxylabs,
	cloro,
	"openai-api": openaiApi,
	"anthropic-api": anthropicApi,
	"mistral-api": mistralApi,
	dataforseo,
	openrouter,
	stub,
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
