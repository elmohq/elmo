import { ENV_REGISTRY } from "@workspace/config/env-registry";
import { WEB_QUERIES_UNAVAILABLE } from "../constants";
import { getCredential } from "../secrets";
import type { ModelConfig } from "./types";

export function configuredWhen(...credentialKeys: string[]): () => boolean {
	return () => credentialKeys.every((key) => !!getCredential(key));
}

/**
 * "unavailable" rather than nothing, so the read path can tell a withheld search
 * from none. `searchProven` is usually the presence of citations.
 */
export function reportedWebQueries(
	queries: string[],
	{ webSearch = true, searchProven = true }: { webSearch?: boolean; searchProven?: boolean } = {},
): string[] {
	if (!webSearch) return [];
	if (queries.length > 0) return queries;
	return searchProven ? [WEB_QUERIES_UNAVAILABLE] : [];
}

// Worst-case bounds, not target lengths, so hitting one means something went
// wrong. They include reasoning and thinking tokens.
export const API_PROVIDER_MAX_OUTPUT_TOKENS: Record<string, number> = {
	"anthropic-api": 8000,
	"openai-api": 8000,
	openrouter: 8000,
	"mistral-api": 8000,
};

/** A clipped answer stores as a real-looking run, so log it (without failing) to tune the caps. */
export function warnIfOutputCapped(provider: string, model: string, finishReason: unknown): void {
	if (finishReason === "length" || finishReason === "max_tokens") {
		console.warn(
			`[${provider}] hit the output cap on "${model}" (finish reason: ${finishReason}) — stored answer may be truncated`,
		);
	}
}

/** Anthropic bills per search. */
export const ANTHROPIC_WEB_SEARCH_MAX_USES = 1;
export const OPENAI_WEB_SEARCH_MAX_TOOL_CALLS = 2;
export const OPENAI_WEB_SEARCH_CONTEXT_SIZE = "low" as const;

// Onboarding research is one-shot, so it searches deeper than recurring tracked runs.
export const RESEARCH_WEB_SEARCH_MAX_USES = 5;
export const RESEARCH_WEB_SEARCH_CONTEXT_SIZE = "medium" as const;

export function validateScrapeTargets(
	configs: ModelConfig[],
	getProvider: (
		id: string,
	) => { isConfigured(): boolean; validateTarget?(config: ModelConfig): string | null } | undefined,
): void {
	const errors = new Set<string>();
	for (const config of configs) {
		const provider = getProvider(config.provider);
		if (!provider) {
			errors.add(`SCRAPE_TARGETS: unknown provider "${config.provider}"`);
			continue;
		}
		if (!provider.isConfigured()) {
			const keys = ENV_REGISTRY.filter((spec) => spec.provider === config.provider && !getCredential(spec.name)).map(
				(spec) => spec.name,
			);
			const keyList = keys.length > 0 ? `: ${keys.join(", ")}` : " (see docs)";
			errors.add(`SCRAPE_TARGETS: provider "${config.provider}" requires API key(s) to be configured${keyList}`);
		}
		if (
			(config.provider === "openai-api" ||
				config.provider === "anthropic-api" ||
				config.provider === "mistral-api" ||
				config.provider === "openrouter") &&
			!config.version
		)
			errors.add(`SCRAPE_TARGETS: "${config.model}:${config.provider}" requires a version slug (third segment)`);
		const targetError = provider.validateTarget?.(config);
		if (targetError) errors.add(`SCRAPE_TARGETS: invalid target "${config.model}:${config.provider}": ${targetError}`);
	}
	if (errors.size > 0) throw new Error([...errors].join("\n"));
}
