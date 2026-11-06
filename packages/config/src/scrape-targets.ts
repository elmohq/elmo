/**
 * SCRAPE_TARGETS format: model:provider[:version][:online]
 * - model: AI model to track (chatgpt, google-ai-mode, gemini, etc.)
 * - provider: How to reach it (olostep, brightdata, direct, openrouter, dataforseo)
 * - version: Specific version slug, required for direct/openrouter (may contain colons for OpenRouter variants)
 * - :online: Append to enable web search. Omit = no web search.
 */

import { PROVIDERS_DOCS_URL } from "./constants";

export interface ModelConfig {
	model: string;
	provider: string;
	version?: string;
	webSearch: boolean;
}

/**
 * Consumer surfaces that went behind a login, so no scraper reaches them. Their
 * model APIs (Perplexity's Sonar through OpenRouter or DataForSEO) still work.
 */
const LOGIN_WALLED_MODELS = new Set(["copilot", "perplexity"]);

const SCRAPER_PROVIDERS = new Set(["brightdata", "cloro", "olostep", "oxylabs", "searchapi"]);

export function isRetiredScrapeTarget(config: Pick<ModelConfig, "model" | "provider">): boolean {
	return LOGIN_WALLED_MODELS.has(config.model) && SCRAPER_PROVIDERS.has(config.provider);
}

const warnedRetired = new Set<string>();

/**
 * Middle segments rejoin with ":", so OpenRouter variant suffixes like ":free" survive.
 *
 * Retired scrape targets are dropped with a warning rather than rejected, so an
 * instance that still lists one keeps running everything else after upgrading.
 */
export function parseScrapeTargets(envValue?: string): ModelConfig[] {
	const configs = parseAllScrapeTargets(envValue);
	for (const config of configs.filter(isRetiredScrapeTarget)) {
		const entry = formatScrapeTarget(config);
		if (warnedRetired.has(entry)) continue;
		warnedRetired.add(entry);
		console.warn(
			`SCRAPE_TARGETS: skipping "${entry}": ${config.model} now requires a login, so no scraper can reach it. Remove it from SCRAPE_TARGETS. See ${PROVIDERS_DOCS_URL}.`,
		);
	}
	return configs.filter((config) => !isRetiredScrapeTarget(config));
}

function parseAllScrapeTargets(envValue?: string): ModelConfig[] {
	if (!envValue || !envValue.trim()) {
		throw new Error(
			"SCRAPE_TARGETS environment variable is required. " +
				"Set it to configure which AI models to track. Example:\n" +
				"  SCRAPE_TARGETS=chatgpt:olostep:online,google-ai-mode:olostep:online,gemini:olostep:online\n" +
				`See ${PROVIDERS_DOCS_URL} for details.`,
		);
	}
	return envValue.split(",").map((raw) => {
		const trimmed = raw.trim();
		if (!trimmed) throw new Error("Invalid SCRAPE_TARGETS: empty entry (check for trailing commas)");
		const parts = trimmed.split(":");
		if (parts.length < 2) throw new Error(`Invalid SCRAPE_TARGETS entry: "${trimmed}" (need at least model:provider)`);
		const model = parts[0];
		const provider = parts[1];
		const webSearch = parts[parts.length - 1] === "online";
		const versionParts = parts.slice(2, webSearch ? -1 : undefined);
		const version = versionParts.length > 0 ? versionParts.join(":") : undefined;
		return { model, provider, version, webSearch };
	});
}

export function formatScrapeTarget(config: ModelConfig): string {
	const parts = [config.model, config.provider];
	if (config.version) parts.push(config.version);
	if (config.webSearch) parts.push("online");
	return parts.join(":");
}

/** One list for the public status page and the scheduled provider tests, so the two can't drift. */
export const STATUS_TARGETS = [
	"chatgpt:searchapi",
	"chatgpt:searchapi:online",
	"google-ai-mode:searchapi:online",
	"google-ai-overview:searchapi:online",
	"gemini:searchapi:online",
	"chatgpt:olostep:online",
	"google-ai-mode:olostep:online",
	"google-ai-overview:olostep:online",
	"gemini:olostep:online",
	"chatgpt:brightdata",
	"chatgpt:brightdata:online",
	"google-ai-mode:brightdata:online",
	"gemini:brightdata:online",
	"google-ai-overview:brightdata:online",
	"chatgpt:oxylabs",
	"chatgpt:oxylabs:online",
	"google-ai-mode:oxylabs:online",
	"google-ai-overview:oxylabs:online",
	"chatgpt:cloro:online",
	"gemini:cloro:online",
	"google-ai-mode:cloro:online",
	"google-ai-overview:cloro:online",
	"google-ai-mode:dataforseo:online",
	"google-ai-overview:dataforseo:online",
	"chatgpt:dataforseo:online",
	"gemini:dataforseo:online",
	"perplexity:dataforseo:online",
	// Pinning a model_name routes to LLM Responses instead of the scraper, so
	// these keep the API side of the provider monitored too.
	"chatgpt:dataforseo:gpt-5.5:online",
	"gemini:dataforseo:gemini-2.5-flash:online",
	"chatgpt:openai-api:gpt-6-luna",
	"chatgpt:openai-api:gpt-6-luna:online",
	"claude:anthropic-api:claude-haiku-5-5",
	"claude:anthropic-api:claude-haiku-5-5:online",
	"claude:openrouter:anthropic/claude-haiku-5.5",
	"claude:openrouter:anthropic/claude-haiku-5.5:online",
	"chatgpt:openrouter:openai/gpt-6-luna",
	"chatgpt:openrouter:openai/gpt-6-luna:online",
	"gemini:openrouter:google/gemini-2.5-flash",
	"gemini:openrouter:google/gemini-2.5-flash:online",
	"deepseek:openrouter:deepseek/deepseek-v3.2",
	"qwen:openrouter:qwen/qwen3-235b-a22b-2507",
	"kimi:openrouter:moonshotai/kimi-k2.5",
	"grok:openrouter:x-ai/grok-4.5",
	"grok:openrouter:x-ai/grok-4.5:online",
	"mistral:openrouter:mistralai/mistral-medium-3.1",
	// Perplexity's own search, not OpenRouter's Exa fallback: with the plugin
	// engine left unset, OpenRouter routes Perplexity slugs to native search.
	"perplexity:openrouter:perplexity/sonar:online",
	"mistral:mistral-api:mistral-medium-latest",
	"mistral:mistral-api:mistral-medium-latest:online",
];

/** No longer tested, but still listed on the status page so the change is visible. */
export const RETIRED_STATUS_TARGETS = [
	"copilot:brightdata:online",
	"copilot:cloro:online",
	"copilot:olostep:online",
	"copilot:searchapi:online",
	"perplexity:brightdata:online",
	"perplexity:cloro:online",
	"perplexity:olostep:online",
	"perplexity:oxylabs:online",
	"perplexity:searchapi:online",
];

/** Derived from STATUS_TARGETS so it only offers combinations the scheduled provider tests exercise. */
export function providersByModel(): Map<string, string[]> {
	const byModel = new Map<string, Set<string>>();
	for (const target of parseScrapeTargets(STATUS_TARGETS.join(","))) {
		const providers = byModel.get(target.model) ?? new Set<string>();
		providers.add(target.provider);
		byModel.set(target.model, providers);
	}
	return new Map([...byModel].map(([model, providers]) => [model, [...providers].sort()]));
}
