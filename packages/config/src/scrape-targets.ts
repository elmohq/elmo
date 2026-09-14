/**
 * The single module that parses and formats the SCRAPE_TARGETS env var.
 *
 * Format: model:provider[:version][:online]
 * - model: AI model to track (chatgpt, google-ai-mode, copilot, etc.)
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
 * Parse the SCRAPE_TARGETS env var into structured ModelConfig objects.
 *
 * Parsing: split on ":". First = model, second = provider. If last segment is "online",
 * pop it (websearch = true). Remaining middle segments rejoined with ":" = version slug.
 * This naturally handles OpenRouter variant suffixes like ":free".
 */
export function parseScrapeTargets(envValue?: string): ModelConfig[] {
	if (!envValue || !envValue.trim()) {
		throw new Error(
			"SCRAPE_TARGETS environment variable is required. " +
				"Set it to configure which AI models to track. Example:\n" +
				"  SCRAPE_TARGETS=chatgpt:olostep:online,google-ai-mode:olostep:online,copilot:olostep:online\n" +
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

/**
 * Inverse of parseScrapeTargets for a single entry: build the
 * model:provider[:version][:online] string from a ModelConfig.
 */
export function formatScrapeTarget(config: ModelConfig): string {
	const parts = [config.model, config.provider];
	if (config.version) parts.push(config.version);
	if (config.webSearch) parts.push("online");
	return parts.join(":");
}

/**
 * The provider:model targets shown on the public status page and exercised by
 * the scheduled test-providers workflow. Both the page and the workflow read
 * this one list so the "what we display" and "what we test" sets can't drift.
 */
export const STATUS_TARGETS = [
	"chatgpt:olostep:online",
	"google-ai-mode:olostep:online",
	"google-ai-overview:olostep:online",
	"gemini:olostep:online",
	"copilot:olostep:online",
	"perplexity:olostep:online",
	"chatgpt:brightdata",
	"chatgpt:brightdata:online",
	"google-ai-mode:brightdata:online",
	"gemini:brightdata:online",
	"perplexity:brightdata:online",
	"copilot:brightdata:online",
	"google-ai-overview:brightdata:online",
	"chatgpt:oxylabs",
	"chatgpt:oxylabs:online",
	"google-ai-mode:oxylabs:online",
	"google-ai-overview:oxylabs:online",
	"perplexity:oxylabs:online",
	"chatgpt:cloro:online",
	"perplexity:cloro:online",
	"copilot:cloro:online",
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
	"chatgpt:openai-api:gpt-5-mini",
	"chatgpt:openai-api:gpt-5-mini:online",
	"claude:anthropic-api:claude-sonnet-5",
	"claude:anthropic-api:claude-sonnet-5:online",
	"claude:openrouter:anthropic/claude-sonnet-5",
	"claude:openrouter:anthropic/claude-sonnet-5:online",
	"chatgpt:openrouter:openai/gpt-5-mini",
	"chatgpt:openrouter:openai/gpt-5-mini:online",
	"gemini:openrouter:google/gemini-2.5-flash",
	"gemini:openrouter:google/gemini-2.5-flash:online",
	"deepseek:openrouter:deepseek/deepseek-v3.2",
	"qwen:openrouter:qwen/qwen3-235b-a22b",
	"kimi:openrouter:moonshotai/kimi-k3",
	"grok:openrouter:x-ai/grok-4.5",
	"grok:openrouter:x-ai/grok-4.5:online",
	"mistral:openrouter:mistralai/mistral-medium-3.1",
	// Perplexity's own search, not OpenRouter's Exa fallback: with the plugin
	// engine left unset, OpenRouter routes Perplexity slugs to native search.
	"perplexity:openrouter:perplexity/sonar:online",
	"mistral:mistral-api:mistral-medium-latest",
	"mistral:mistral-api:mistral-medium-latest:online",
];

/**
 * Which providers can serve each trackable model, derived from STATUS_TARGETS so
 * the answer is limited to combinations the scheduled provider workflow actually
 * exercises. Used to tell a self-hosted operator what they would need in order
 * to track a platform they have not configured yet.
 */
export function providersByModel(): Map<string, string[]> {
	const byModel = new Map<string, Set<string>>();
	for (const target of parseScrapeTargets(STATUS_TARGETS.join(","))) {
		const providers = byModel.get(target.model) ?? new Set<string>();
		providers.add(target.provider);
		byModel.set(target.model, providers);
	}
	return new Map([...byModel].map(([model, providers]) => [model, [...providers].sort()]));
}

/**
 * What a monitored target should return, declared independently of the code
 * that extracts it. Without that separation a broken extractor and a provider
 * that exposes nothing are the same observation.
 */
export interface TargetExpectation {
	/**
	 * Whether this target reports the searches it ran.
	 *
	 * - "yes": absence over a window is a defect.
	 * - "no": established that none exist. Queries appearing anyway mean the
	 *   provider moved ahead of our extractor.
	 * - "intermittent": capable, but too rare to assert per window.
	 * - "unknown": we see none and haven't established why. Settle one by
	 *   reading a payload (`test-provider.ts --dump`).
	 */
	webQueries: "yes" | "no" | "intermittent" | "unknown";
	citations: "yes" | "no";
	/** False when this row is a guess, so a failure points at the likelier culprit. */
	verified: boolean;
}

const NO_SEARCH: TargetExpectation = { webQueries: "no", citations: "no", verified: true };

/**
 * Held to a 1:1 match with STATUS_TARGETS by its test, so a target can't be
 * monitored without someone stating what it should return.
 */
export const STATUS_TARGET_EXPECTATIONS: Record<string, TargetExpectation> = {
	"chatgpt:olostep:online": { webQueries: "yes", citations: "yes", verified: true },
	"google-ai-mode:olostep:online": { webQueries: "unknown", citations: "yes", verified: false },
	"google-ai-overview:olostep:online": { webQueries: "unknown", citations: "yes", verified: false },
	"gemini:olostep:online": { webQueries: "unknown", citations: "yes", verified: false },
	"copilot:olostep:online": { webQueries: "unknown", citations: "yes", verified: false },
	"perplexity:olostep:online": { webQueries: "yes", citations: "yes", verified: true },

	"chatgpt:brightdata": NO_SEARCH,
	"chatgpt:brightdata:online": { webQueries: "intermittent", citations: "yes", verified: true },
	"google-ai-mode:brightdata:online": { webQueries: "unknown", citations: "yes", verified: false },
	"gemini:brightdata:online": { webQueries: "unknown", citations: "yes", verified: false },
	"perplexity:brightdata:online": { webQueries: "yes", citations: "yes", verified: true },
	"copilot:brightdata:online": { webQueries: "unknown", citations: "yes", verified: false },
	"google-ai-overview:brightdata:online": { webQueries: "unknown", citations: "yes", verified: false },

	"chatgpt:oxylabs": NO_SEARCH,
	"chatgpt:oxylabs:online": { webQueries: "yes", citations: "yes", verified: true },
	"google-ai-mode:oxylabs:online": { webQueries: "unknown", citations: "yes", verified: false },
	"google-ai-overview:oxylabs:online": { webQueries: "unknown", citations: "yes", verified: false },
	"perplexity:oxylabs:online": { webQueries: "unknown", citations: "yes", verified: false },

	"chatgpt:cloro:online": { webQueries: "unknown", citations: "yes", verified: false },
	"perplexity:cloro:online": { webQueries: "yes", citations: "yes", verified: true },
	"copilot:cloro:online": { webQueries: "yes", citations: "yes", verified: true },
	"gemini:cloro:online": { webQueries: "unknown", citations: "yes", verified: false },
	"google-ai-mode:cloro:online": { webQueries: "unknown", citations: "yes", verified: false },
	"google-ai-overview:cloro:online": { webQueries: "unknown", citations: "yes", verified: false },

	// From dataforseo-client's types: no SERP AI Mode model carries a query
	// field, while the AI Optimization results carry `fan_out_queries`. The
	// Gemini scraper is the exception with no equivalent.
	"google-ai-mode:dataforseo:online": { webQueries: "no", citations: "yes", verified: true },
	"google-ai-overview:dataforseo:online": { webQueries: "no", citations: "yes", verified: true },
	"chatgpt:dataforseo:online": { webQueries: "intermittent", citations: "yes", verified: true },
	"gemini:dataforseo:online": { webQueries: "no", citations: "yes", verified: true },
	"perplexity:dataforseo:online": { webQueries: "unknown", citations: "yes", verified: false },
	// A pinned model_name routes to LLM Responses, which returns fan_out_queries
	// for every model — including the Gemini that has none via the scraper.
	"chatgpt:dataforseo:gpt-5.5:online": { webQueries: "yes", citations: "yes", verified: true },
	"gemini:dataforseo:gemini-2.5-flash:online": { webQueries: "yes", citations: "yes", verified: true },

	// Search is opt-in, so queries without `:online` would mean a target is
	// searching, and being billed for it, against its own configuration.
	"chatgpt:openai-api:gpt-5-mini": NO_SEARCH,
	"chatgpt:openai-api:gpt-5-mini:online": { webQueries: "yes", citations: "yes", verified: true },
	"claude:anthropic-api:claude-sonnet-5": NO_SEARCH,
	"claude:anthropic-api:claude-sonnet-5:online": { webQueries: "yes", citations: "yes", verified: true },
	"mistral:mistral-api:mistral-medium-latest": NO_SEARCH,
	"mistral:mistral-api:mistral-medium-latest:online": { webQueries: "yes", citations: "yes", verified: true },

	// `:online` routes to the model's own search where it has one. These fail
	// today: the provider writes the sentinel without inspecting the payload.
	"claude:openrouter:anthropic/claude-sonnet-5": NO_SEARCH,
	"claude:openrouter:anthropic/claude-sonnet-5:online": { webQueries: "yes", citations: "yes", verified: false },
	"chatgpt:openrouter:openai/gpt-5-mini": NO_SEARCH,
	"chatgpt:openrouter:openai/gpt-5-mini:online": { webQueries: "yes", citations: "yes", verified: false },
	"gemini:openrouter:google/gemini-2.5-flash": NO_SEARCH,
	"gemini:openrouter:google/gemini-2.5-flash:online": { webQueries: "yes", citations: "yes", verified: false },
	"grok:openrouter:x-ai/grok-4.5": NO_SEARCH,
	"grok:openrouter:x-ai/grok-4.5:online": { webQueries: "yes", citations: "yes", verified: false },
	"perplexity:openrouter:perplexity/sonar:online": { webQueries: "yes", citations: "yes", verified: false },
	"deepseek:openrouter:deepseek/deepseek-v3.2": NO_SEARCH,
	"qwen:openrouter:qwen/qwen3-235b-a22b": NO_SEARCH,
	"kimi:openrouter:moonshotai/kimi-k3": NO_SEARCH,
	"mistral:openrouter:mistralai/mistral-medium-3.1": NO_SEARCH,
};
