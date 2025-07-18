import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Prompt, PromptRun } from "./db/schema";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Calculate the average AI visibility across all runs from the last 30 days for enabled prompts
 * @param prompts - Array of prompts for the brand
 * @param promptRuns - Array of all prompt runs for the brand
 * @returns Percentage (0-100) representing average visibility
 */
export function calculateAverageVisibility(prompts: Prompt[], promptRuns: PromptRun[]): number {
	if (!prompts || prompts.length === 0) {
		return 0;
	}

	// Filter to only enabled prompts
	const enabledPrompts = prompts.filter((prompt) => prompt.enabled);

	if (enabledPrompts.length === 0) {
		return 0;
	}

	// Get enabled prompt IDs for filtering
	const enabledPromptIds = new Set(enabledPrompts.map((prompt) => prompt.id));

	// Calculate date 30 days ago
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	// Filter prompt runs to only those from last 30 days and for enabled prompts
	const recentRuns = promptRuns.filter(
		(run) => enabledPromptIds.has(run.promptId) && new Date(run.createdAt) >= thirtyDaysAgo,
	);

	if (recentRuns.length === 0) {
		return 0;
	}

	// Count how many runs have brandMentioned = true
	const mentionedCount = recentRuns.filter((run) => run.brandMentioned).length;

	// Return percentage
	return Math.round((mentionedCount / recentRuns.length) * 100);
}
