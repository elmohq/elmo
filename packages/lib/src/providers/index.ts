import type { Provider } from "./types";
import { olostep } from "./olostep";
import { brightdata } from "./brightdata";
import { directOpenai } from "./direct-openai";
import { directAnthropic } from "./direct-anthropic";
import { dataforseo } from "./dataforseo";
import { openrouter } from "./openrouter";

export type { Provider, ScrapeResult, ProviderOptions, TestResult, ModelConfig } from "./types";
export { KNOWN_MODELS, getModelMeta, MODEL_TO_LEGACY_MODEL_GROUP, LEGACY_MODEL_GROUP_TO_MODEL } from "./models";
export type { ModelMeta } from "./models";
export { parseScrapeTargets, validateScrapeTargets } from "./config";

const providerMap: Record<string, Provider> = {
	olostep,
	brightdata,
	direct: directOpenai,
	"direct-openai": directOpenai,
	"direct-anthropic": directAnthropic,
	dataforseo,
	openrouter,
};

/**
 * Resolve "direct" to the model-specific direct provider.
 * "direct" auto-maps to "direct-openai" for chatgpt or "direct-anthropic" for claude.
 */
export function resolveProviderId(providerId: string, model: string): string {
	if (providerId !== "direct") return providerId;
	switch (model) {
		case "claude":
			return "direct-anthropic";
		default:
			return "direct-openai";
	}
}

export function getProvider(id: string): Provider {
	const p = providerMap[id];
	if (!p) throw new Error(`Unknown provider: "${id}"`);
	return p;
}

export function getAvailableProviders(): Provider[] {
	const seen = new Set<string>();
	return Object.values(providerMap).filter((p) => {
		if (seen.has(p.id)) return false;
		seen.add(p.id);
		return p.isConfigured();
	});
}

export function getAllProviders(): Provider[] {
	const seen = new Set<string>();
	return Object.values(providerMap).filter((p) => {
		if (seen.has(p.id)) return false;
		seen.add(p.id);
		return true;
	});
}
