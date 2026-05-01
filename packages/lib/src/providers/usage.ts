import type { StructuredResearchUsage } from "./types";

interface RawUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	reasoningTokens?: number;
	cachedInputTokens?: number;
}

/**
 * Normalize the AI SDK's `LanguageModelUsage` into the shape our research
 * callers expect — computing `totalTokens` when the SDK didn't, and passing
 * through reasoning + cache-read tokens when the provider reports them.
 */
export function extractUsage(usage: RawUsage | undefined): StructuredResearchUsage | undefined {
	if (!usage) return undefined;
	const inputTokens = usage.inputTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	const reasoningTokens = usage.reasoningTokens;
	const cacheReadTokens = usage.cachedInputTokens;
	return {
		inputTokens,
		outputTokens,
		totalTokens:
			usage.totalTokens ?? inputTokens + outputTokens + (reasoningTokens ?? 0) + (cacheReadTokens ?? 0),
		...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
		...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
	};
}
