import type { Provider } from "./types";
import { withProviderSlot } from "./limiter";
import { olostep } from "./registry/olostep";
import { brightdata } from "./registry/brightdata";
import { oxylabs } from "./registry/oxylabs";
import { cloro } from "./registry/cloro";
import { openaiApi } from "./registry/openai-api";
import { anthropicApi } from "./registry/anthropic-api";
import { mistralApi } from "./registry/mistral-api";
import { dataforseo } from "./registry/dataforseo";
import { openrouter } from "./registry/openrouter";
import { stub } from "./registry/stub";

export type {
	Provider,
	ScrapeResult,
	ProviderOptions,
	TestResult,
	ModelConfig,
	StructuredResearchOptions,
	StructuredResearchResult,
} from "./types";
export { KNOWN_MODELS, getModelMeta } from "./models";
export type { ModelMeta } from "./models";
export { parseScrapeTargets, validateScrapeTargets } from "./config";
export { STATUS_TARGETS } from "@workspace/config/scrape-targets";
export { selectTargetsForBrand } from "./runner";
// ProviderFatalError stays internal to this package: it's how a provider
// implementation tells the limiter "stop calling me", not something callers raise.
export { ProviderUnavailableError, getProviderMaxConcurrency } from "./limiter";

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

// Gating happens here rather than at the call sites so nothing can reach a
// provider's paid `run` without passing the concurrency gate and breaker —
// forgetting to wrap one caller is how the cap silently stops holding.
const gatedProviders = new Map<string, Provider>();

export function getProvider(id: string): Provider {
	const p = providerMap[id];
	if (!p) throw new Error(`Unknown provider: "${id}"`);

	let gated = gatedProviders.get(id);
	if (!gated) {
		gated = { ...p, run: (model, prompt, options) => withProviderSlot(id, () => p.run(model, prompt, options)) };
		gatedProviders.set(id, gated);
	}
	return gated;
}

export function getAvailableProviders(): Provider[] {
	return Object.values(providerMap).filter((p) => p.isConfigured());
}

export function getAllProviders(): Provider[] {
	return Object.values(providerMap);
}
