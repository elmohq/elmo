import type { ModelConfig } from "./types";

/**
 * Parse the SCRAPE_TARGETS env var into structured ModelConfig objects.
 *
 * Format: model:provider[:version][:online]
 * - model: AI model to track (chatgpt, google-ai-mode, copilot, etc.)
 * - provider: How to reach it (olostep, brightdata, direct, openrouter, dataforseo)
 * - version: Specific version slug, required for direct/openrouter (may contain colons for OpenRouter variants)
 * - :online: Append to enable web search. Omit = no web search.
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
			"See https://docs.elmohq.com/docs/deployment/providers for details.",
		);
	}
	return envValue.split(",").map((raw) => {
		const trimmed = raw.trim();
		if (!trimmed) throw new Error('Invalid SCRAPE_TARGETS: empty entry (check for trailing commas)');
		const parts = trimmed.split(":");
		if (parts.length < 2)
			throw new Error(`Invalid SCRAPE_TARGETS entry: "${trimmed}" (need at least model:provider)`);
		const model = parts[0];
		const provider = parts[1];
		const webSearch = parts[parts.length - 1] === "online";
		const versionParts = parts.slice(2, webSearch ? -1 : undefined);
		const version = versionParts.length > 0 ? versionParts.join(":") : undefined;
		return { model, provider, version, webSearch };
	});
}

export function validateScrapeTargets(
	configs: ModelConfig[],
	getProvider: (id: string) => { isConfigured(): boolean } | undefined,
): void {
	for (const config of configs) {
		const provider = getProvider(config.provider);
		if (!provider) throw new Error(`SCRAPE_TARGETS: unknown provider "${config.provider}"`);
		if (!provider.isConfigured())
			throw new Error(
				`SCRAPE_TARGETS: provider "${config.provider}" requires API key(s) to be configured (see docs)`,
			);
		if ((config.provider === "openai-api" || config.provider === "anthropic-api" || config.provider === "openrouter") && !config.version)
			throw new Error(`SCRAPE_TARGETS: "${config.model}:${config.provider}" requires a version slug (third segment)`);
	}
}
