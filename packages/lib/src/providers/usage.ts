import type { StructuredResearchUsage } from "./types";

/**
 * Normalize the AI SDK's `LanguageModelUsage` (which has every field marked
 * `| undefined`) into the simpler shape our `runStructuredResearch` callers
 * expect — also computing `totalTokens` ourselves when the SDK didn't.
 */
export function extractUsage(
	usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined,
): StructuredResearchUsage | undefined {
	if (!usage) return undefined;
	const inputTokens = usage.inputTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	return {
		inputTokens,
		outputTokens,
		totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
	};
}
