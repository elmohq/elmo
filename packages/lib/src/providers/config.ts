import { WEB_QUERIES_UNAVAILABLE } from "../constants";
import { getCredential } from "../secrets";
import type { ModelConfig } from "./types";

export function configuredWhen(...credentialKeys: string[]): () => boolean {
	return () => credentialKeys.every((key) => !!getCredential(key));
}

/**
 * A run that searched but withheld its query strings is marked "unavailable"
 * rather than dropped, so the read path can tell it apart from one that never
 * searched. `searchProven` is whatever evidence a provider offers that a search
 * ran — usually the presence of citations.
 */
export function reportedWebQueries(
	queries: string[],
	{ webSearch = true, searchProven = true }: { webSearch?: boolean; searchProven?: boolean } = {},
): string[] {
	if (!webSearch) return [];
	if (queries.length > 0) return queries;
	return searchProven ? [WEB_QUERIES_UNAVAILABLE] : [];
}

// Per-call output caps for the direct API providers: a worst-case bound on a
// single tracked run, not a target length — sized well above any answer we
// expect, so hitting one means something went wrong (warnIfOutputCapped logs
// it). A cap covers reasoning and thinking tokens as well as visible output.
// These are code defaults; per-target overrides are a follow-up and aren't
// threaded through ProviderOptions yet.
export const API_PROVIDER_MAX_OUTPUT_TOKENS: Record<string, number> = {
	"anthropic-api": 8000,
	"openai-api": 8000,
	openrouter: 8000,
	"mistral-api": 8000,
};

/**
 * A capped response still stores as a normal run, so a clipped answer would
 * land as a real-looking result with fewer brand mentions rather than an error.
 * Log it — deliberately without failing the run — so the caps above can be
 * tuned from evidence.
 */
export function warnIfOutputCapped(provider: string, model: string, finishReason: unknown): void {
	if (finishReason === "length" || finishReason === "max_tokens") {
		console.warn(
			`[${provider}] hit the output cap on "${model}" (finish reason: ${finishReason}) — stored answer may be truncated`,
		);
	}
}

/** Web-search budget per tracked run. Anthropic bills per search. */
export const ANTHROPIC_WEB_SEARCH_MAX_USES = 1;
/** Caps built-in tool invocations on the OpenAI Responses API per run. */
export const OPENAI_WEB_SEARCH_MAX_TOOL_CALLS = 2;
/** Web-search context tier for OpenAI tracked runs (cheapest tier). */
export const OPENAI_WEB_SEARCH_CONTEXT_SIZE = "low" as const;

// The onboarding structured-research path (runStructuredResearch) is a one-shot,
// non-recurring call, so it searches deeper than a tracked run: recurring tracked
// runs are the cost surface and stay tightly capped above.
/** Web-search budget for the structured-research path (openai maxToolCalls / anthropic maxUses). */
export const RESEARCH_WEB_SEARCH_MAX_USES = 5;
/** Web-search context tier for the structured-research path. */
export const RESEARCH_WEB_SEARCH_CONTEXT_SIZE = "medium" as const;

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
