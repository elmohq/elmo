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

export interface RetiredScrapeTarget {
	target: string;
	reason: string;
	replacements: string[];
}

const SCRAPERS = ["brightdata", "cloro", "olostep", "oxylabs", "searchapi"];

/**
 * Perplexity and the Copilot app went behind a login, so no scraper reaches
 * them. Perplexity's Sonar model API still works, and Bing AI Mode is the
 * Microsoft answer signed-out visitors still get.
 */
const RETIRED_SCRAPES: Record<string, { providers: string[]; reason: string; replacements: string[] }> = {
	perplexity: {
		providers: SCRAPERS,
		reason: "Perplexity now requires a login, so no scraper can reach it, but its Sonar model API still works.",
		replacements: ["perplexity:openrouter:perplexity/sonar:online", "perplexity:dataforseo:online"],
	},
	copilot: {
		providers: SCRAPERS,
		reason: "The Copilot app now requires a login, so no scraper can reach it. Bing AI Mode is still open to scrapers.",
		replacements: ["bing-ai-mode:cloro:online", "bing-ai-mode:searchapi:online"],
	},
};

function isRetiredScrapeTarget(config: ModelConfig): boolean {
	return RETIRED_SCRAPES[config.model]?.providers.includes(config.provider) ?? false;
}

/** The SCRAPE_TARGETS entries `parseScrapeTargets` skips, with what to run in their place. */
export function retiredScrapeTargets(envValue?: string): RetiredScrapeTarget[] {
	return parseAllScrapeTargets(envValue)
		.filter(isRetiredScrapeTarget)
		.map((config) => {
			const { reason, replacements } = RETIRED_SCRAPES[config.model];
			return { target: formatScrapeTarget(config), reason, replacements };
		});
}

const warned = new Set<string>();

/**
 * Middle segments rejoin with ":", so OpenRouter variant suffixes like ":free" survive.
 *
 * Retired scrape targets are dropped with a warning rather than rejected, so an
 * instance that still lists one keeps running everything else after upgrading.
 */
export function parseScrapeTargets(envValue?: string): ModelConfig[] {
	for (const { target, reason, replacements } of retiredScrapeTargets(envValue)) {
		if (warned.has(target)) continue;
		warned.add(target);
		console.warn(
			`SCRAPE_TARGETS: skipping "${target}". ${reason} Replace it with ${replacements.join(" or ")}. See ${PROVIDERS_DOCS_URL}.`,
		);
	}
	return parseAllScrapeTargets(envValue).filter((config) => !isRetiredScrapeTarget(config));
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
	"bing-ai-mode:searchapi:online",
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
	"bing-ai-mode:cloro:online",
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
	"grok:openrouter:x-ai/grok-4.7",
	"grok:openrouter:x-ai/grok-4.7:online",
	"meta:openrouter:meta/muse-spark-1.3:online",
	"mistral:openrouter:mistralai/mistral-medium-3.1",
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
