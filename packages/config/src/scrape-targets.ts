/**
 * The single module that parses and formats the SCRAPE_TARGETS env var.
 *
 * Format: model:provider[:version][:online]
 * - model: AI model to track (chatgpt, google-ai-mode, copilot, etc.)
 * - provider: How to reach it (olostep, brightdata, direct, openrouter, dataforseo)
 * - version: Specific version slug, required for direct/openrouter (may contain colons for OpenRouter variants)
 * - :online: Append to enable web search. Omit = no web search.
 */

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
				"See https://docs.elmohq.com/docs/user-guide/providers for details.",
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
	"google-ai-mode:dataforseo:online",
	"google-ai-overview:dataforseo:online",
	"chatgpt:dataforseo:online",
	"perplexity:dataforseo:online",
	"gemini:dataforseo:online",
	"chatgpt:openai-api:gpt-5-mini",
	"chatgpt:openai-api:gpt-5-mini:online",
	"claude:anthropic-api:claude-sonnet-4-6",
	"claude:anthropic-api:claude-sonnet-4-6:online",
	"claude:openrouter:anthropic/claude-sonnet-4.6",
	"claude:openrouter:anthropic/claude-sonnet-4.6:online",
	"chatgpt:openrouter:openai/gpt-5-mini",
	"chatgpt:openrouter:openai/gpt-5-mini:online",
	"gemini:openrouter:google/gemini-2.5-flash",
	"gemini:openrouter:google/gemini-2.5-flash:online",
	"deepseek:openrouter:deepseek/deepseek-v3.2",
	"kimi:openrouter:moonshotai/kimi-k3",
	"grok:openrouter:x-ai/grok-4.5",
	"grok:openrouter:x-ai/grok-4.5:online",
	"mistral:openrouter:mistralai/mistral-medium-3.1",
	"mistral:mistral-api:mistral-medium-latest",
	"mistral:mistral-api:mistral-medium-latest:online",
];
