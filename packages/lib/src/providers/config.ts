import type { EngineConfig } from "./types";

/**
 * Parse the SCRAPE_TARGETS env var into structured EngineConfig objects.
 *
 * Format: engine:provider[:model][:online]
 * - engine: AI engine to track (chatgpt, google-ai-mode, copilot, etc.)
 * - provider: How to reach it (olostep, brightdata, direct, openrouter, dataforseo)
 * - model: Specific model slug, required for direct/openrouter (may contain colons for OpenRouter variants)
 * - :online: Append to enable web search. Omit = no web search.
 *
 * Parsing: split on ":". First = engine, second = provider. If last segment is "online",
 * pop it (websearch = true). Remaining middle segments rejoined with ":" = model slug.
 * This naturally handles OpenRouter variant suffixes like ":free".
 */
export function parseScrapeTargets(envValue?: string): EngineConfig[] {
	if (!envValue || !envValue.trim()) {
		throw new Error(
			"SCRAPE_TARGETS environment variable is required. " +
			"Set it to configure which AI engines to track. Example:\n" +
			"  SCRAPE_TARGETS=chatgpt:olostep:online,google-ai-mode:olostep:online,copilot:olostep:online\n" +
			"See https://docs.elmohq.com/docs/deployment/providers for details.",
		);
	}
	return envValue.split(",").map((raw) => {
		const trimmed = raw.trim();
		if (!trimmed) throw new Error('Invalid SCRAPE_TARGETS: empty entry (check for trailing commas)');
		const parts = trimmed.split(":");
		if (parts.length < 2)
			throw new Error(`Invalid SCRAPE_TARGETS entry: "${trimmed}" (need at least engine:provider)`);
		const engine = parts[0];
		const provider = parts[1];
		const webSearch = parts[parts.length - 1] === "online";
		const modelParts = parts.slice(2, webSearch ? -1 : undefined);
		const model = modelParts.length > 0 ? modelParts.join(":") : undefined;
		return { engine, provider, model, webSearch };
	});
}

export function validateScrapeTargets(
	configs: EngineConfig[],
	getProvider: (id: string) => { isConfigured(): boolean } | undefined,
): void {
	for (const config of configs) {
		const provider = getProvider(config.provider);
		if (!provider) throw new Error(`SCRAPE_TARGETS: unknown provider "${config.provider}"`);
		if (!provider.isConfigured())
			throw new Error(
				`SCRAPE_TARGETS: provider "${config.provider}" requires API key(s) to be configured (see docs)`,
			);
		if ((config.provider === "direct" || config.provider === "openrouter") && !config.model)
			throw new Error(`SCRAPE_TARGETS: "${config.engine}:${config.provider}" requires a model slug (third segment)`);
	}
}
