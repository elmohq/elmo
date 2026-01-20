import type { Prompt, PromptRun, Brand, Competitor } from "@workspace/lib/db/schema";

/**
 * Get the display name for a model with proper capitalization
 * @param model - The model identifier string
 * @returns Formatted model name (e.g., "openai" -> "OpenAI")
 */
export function getModelDisplayName(model: string): string {
	switch (model) {
		case "openai":
			return "OpenAI";
		case "anthropic":
			return "Anthropic";
		case "google":
			return "Google";
		default:
			return model;
	}
}

/**
 * Calculate the average AI visibility across all runs from the last 30 days for enabled prompts
 * Only includes prompts that have at least one brand or competitor mention in the period
 * @param prompts - Array of prompts for the brand
 * @param promptRuns - Array of all prompt runs for the brand
 * @param brand - Brand data (optional, for future use)
 * @param competitors - Array of competitors (optional, for future use)
 * @returns Percentage (0-100) representing average visibility
 */
export function calculateAverageVisibility(
	prompts: Prompt[],
	promptRuns: PromptRun[],
	brand?: Brand,
	competitors?: Competitor[],
): number {
	if (!prompts || prompts.length === 0) {
		return 0;
	}

	// Filter to only enabled prompts
	const enabledPrompts = prompts.filter((prompt) => prompt.enabled);
	if (enabledPrompts.length === 0) {
		return 0;
	}

	// Calculate date 30 days ago
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	// Filter prompt runs to only those from last 30 days and for enabled prompts
	const enabledPromptIds = new Set(enabledPrompts.map((prompt) => prompt.id));
	const recentRuns = promptRuns.filter(
		(run) => enabledPromptIds.has(run.promptId) && new Date(run.createdAt) >= thirtyDaysAgo,
	);

	if (recentRuns.length === 0) {
		return 0;
	}

	// Group runs by promptId
	const runsByPrompt = new Map<string, PromptRun[]>();
	for (const run of recentRuns) {
		if (!runsByPrompt.has(run.promptId)) {
			runsByPrompt.set(run.promptId, []);
		}
		runsByPrompt.get(run.promptId)!.push(run);
	}

	// Filter out prompts that have no brand or competitor mentions in this period
	const qualifyingRuns: PromptRun[] = [];
	for (const [promptId, runs] of runsByPrompt) {
		const hasAnyMentions = runs.some(
			(run) => run.brandMentioned || (run.competitorsMentioned && run.competitorsMentioned.length > 0),
		);

		if (hasAnyMentions) {
			qualifyingRuns.push(...runs);
		}
	}

	if (qualifyingRuns.length === 0) {
		return 0;
	}

	// Calculate the percentage of runs with brand mentions
	const brandMentionedCount = qualifyingRuns.filter((run) => run.brandMentioned).length;
	return Math.round((brandMentionedCount / qualifyingRuns.length) * 100);
}
