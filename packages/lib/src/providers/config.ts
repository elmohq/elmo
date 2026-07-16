import type { ModelConfig } from "./types";

// SCRAPE_TARGETS parsing/formatting lives in @workspace/config (the env source
// of truth, shared with the CLI); re-exported here for compatibility.
export { parseScrapeTargets } from "@workspace/config/scrape-targets";

/**
 * Hard per-call output-token caps for the direct API providers. Server-side
 * safety net so a single tracked run has bounded spend — not tunable per
 * plan or env on purpose. OpenAI/OpenRouter get headroom because
 * max_output_tokens counts reasoning tokens on gpt-5-family models.
 */
export const API_PROVIDER_MAX_OUTPUT_TOKENS: Record<string, number> = {
	"anthropic-api": 4000,
	"openai-api": 8000,
	openrouter: 8000,
	"mistral-api": 4000,
};

/** Web-search budget per tracked run. Anthropic bills per search. */
export const ANTHROPIC_WEB_SEARCH_MAX_USES = 1;
/** Caps built-in tool invocations on the OpenAI Responses API per run. */
export const OPENAI_WEB_SEARCH_MAX_TOOL_CALLS = 2;
/** Result cap for the OpenRouter Exa fallback branch (ignored by native). */
export const OPENROUTER_WEB_MAX_RESULTS = 5;
/** Native web-search context tier for OpenRouter tracked runs; bounds native
 *  passthrough cost. "low" | "medium" | "high" — "medium" is the provider
 *  default, chosen to preserve parity with the real consumer surface. */
export const OPENROUTER_WEB_SEARCH_CONTEXT_SIZE = "medium" as const;

export function validateScrapeTargets(
	configs: ModelConfig[],
	getProvider: (
		id: string,
	) => { isConfigured(): boolean; validateTarget?(config: ModelConfig): string | null } | undefined,
): void {
	for (const config of configs) {
		const provider = getProvider(config.provider);
		if (!provider) throw new Error(`SCRAPE_TARGETS: unknown provider "${config.provider}"`);
		if (!provider.isConfigured())
			throw new Error(`SCRAPE_TARGETS: provider "${config.provider}" requires API key(s) to be configured (see docs)`);
		if (
			(config.provider === "openai-api" ||
				config.provider === "anthropic-api" ||
				config.provider === "mistral-api" ||
				config.provider === "openrouter") &&
			!config.version
		)
			throw new Error(`SCRAPE_TARGETS: "${config.model}:${config.provider}" requires a version slug (third segment)`);
		const targetError = provider.validateTarget?.(config);
		if (targetError)
			throw new Error(`SCRAPE_TARGETS: invalid target "${config.model}:${config.provider}": ${targetError}`);
	}
}
