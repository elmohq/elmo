import { PROVIDERS_DOCS_URL } from "@workspace/config/constants";
import { DEFAULT_MARKET, type Market } from "@workspace/config/markets";
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

const providerMap: Record<string, Provider> = {
	searchapi,
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
 * A prompt's country is best effort: every target runs every prompt, and is
 * told the country where its provider takes one.
 *
 * - `localized`: the provider is told the country and answers from it.
 * - `location-free`: a model called without web search, whose answer has no location.
 * - `provider-default`: the provider can't be told this country, so it answers
 *   from wherever it does by default.
 */
export type CountryHandling = "localized" | "location-free" | "provider-default";

export interface MarketHandling {
	country: CountryHandling;
	/** Whether the language reaches the provider as a parameter, beyond the prompt being written in it. */
	sendsLanguage: boolean;
}

/** The one answer the worker, the UI, and the docs share about what a target does with a market. */
export function describeMarketHandling(config: ModelConfig, market: Market): MarketHandling {
	const provider = getProvider(config.provider);
	const country = countryHandling(provider, config, market.country);
	return { country, sendsLanguage: provider.sendsLanguage?.(config) ?? false };
}

function countryHandling(provider: Provider, config: ModelConfig, country: string): CountryHandling {
	if (provider.localizes?.(config, country)) return "localized";
	return !config.webSearch && resolveProviderAccess(config) === "api" ? "location-free" : "provider-default";
}

/** What to ask a target with: a country its provider can't take falls back to the default it has always been sent. */
export function marketToSend(config: ModelConfig, market: Market): Market {
	return describeMarketHandling(config, market).country === "localized"
		? market
		: { ...market, country: DEFAULT_MARKET.country };
}

/** What a run should record as sent: null for whichever half the provider wasn't given. */
export function sentMarket(config: ModelConfig, market: Market): { country: string | null; language: string | null } {
	const handling = describeMarketHandling(config, market);
	return {
		country: handling.country === "localized" ? market.country : null,
		language: handling.sendsLanguage ? market.language : null,
	};
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
