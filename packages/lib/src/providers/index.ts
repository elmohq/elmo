import { PROVIDERS_DOCS_URL } from "@workspace/config/constants";
import { extractorFor } from "../text-extraction";
import { resolveCitationRedirects } from "./citation-redirects";
import { anthropicApi } from "./registry/anthropic-api";
import { brightdata } from "./registry/brightdata";
import { cloro } from "./registry/cloro";
import { dataforseo } from "./registry/dataforseo";
import { mistralApi } from "./registry/mistral-api";
import { olostep } from "./registry/olostep";
import { openaiApi } from "./registry/openai-api";
import { openrouter } from "./registry/openrouter";
import { oxylabs } from "./registry/oxylabs";
import { searchapi } from "./registry/searchapi";
import { stub } from "./registry/stub";
import type { ModelConfig, Provider, ProviderAccess } from "./types";

export { validateScrapeTargets } from "./config";
export { selectTargetsForBrand } from "./runner";
export type {
	ModelConfig,
	Provider,
	ProviderAccess,
	ProviderOptions,
	ScrapeResult,
	StructuredResearchOptions,
	StructuredResearchResult,
	TestResult,
} from "./types";

/**
 * Cited redirects are resolved here rather than in each provider: every vendor
 * that scrapes Google AI Overview or AI Mode hands back the same `/goto` links,
 * and they have to be followed before they expire.
 */
function resolvingCitationRedirects(provider: Provider): Provider {
	return {
		...provider,
		async run(model, prompt, options) {
			const result = await provider.run(model, prompt, options);
			await resolveCitationRedirects(result.rawOutput, extractorFor({ provider: provider.id, model }));
			return result;
		},
	};
}

const registry: Provider[] = [
	searchapi,
	olostep,
	brightdata,
	oxylabs,
	cloro,
	openaiApi,
	anthropicApi,
	mistralApi,
	dataforseo,
	openrouter,
	stub,
];

const providerMap: Record<string, Provider> = Object.fromEntries(
	registry.map((provider) => [provider.id, resolvingCitationRedirects(provider)]),
);

export function getProvider(id: string): Provider {
	const p = providerMap[id];
	if (!p) throw new Error(`Unknown provider: "${id}"`);
	return p;
}

/**
 * How a configured target is reached — scraped consumer surface or direct API
 * call. A target may refine its provider's default, which is why this takes the
 * whole config rather than an id.
 */
export function resolveProviderAccess(config: ModelConfig): ProviderAccess {
	const provider = getProvider(config.provider);
	return provider.accessFor?.(config) ?? provider.access;
}

/**
 * Whether a target is a model called directly with its own web search on — the
 * expensive kind, an order of magnitude dearer than the same call ungrounded,
 * which is why these are sold from a metered pool rather than picked per brand.
 *
 * Web search alone doesn't say it: every scraped target is "online" too, since
 * a consumer surface always searches. It's the combination that costs.
 */
export function isGroundedApiTarget(config: ModelConfig): boolean {
	return config.webSearch && resolveProviderAccess(config) === "api";
}

/**
 * How to configure a provider, what to call it, and whether it reaches models by
 * scraping or by API.
 *
 * `access` here is the provider's default, which is what a suggestion needs;
 * `resolveProviderAccess` answers for a target that may have refined it.
 */
export function describeProvider(id: string): { id: string; name: string; access: ProviderAccess; docsUrl: string } {
	const provider = getProvider(id);
	return {
		id,
		name: provider.name,
		access: provider.access,
		docsUrl: provider.docsAnchor ? `${PROVIDERS_DOCS_URL}#${provider.docsAnchor}` : PROVIDERS_DOCS_URL,
	};
}

export function getAvailableProviders(): Provider[] {
	return Object.values(providerMap).filter((p) => p.isConfigured());
}

export function getAllProviders(): Provider[] {
	return Object.values(providerMap);
}
