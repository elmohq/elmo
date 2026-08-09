/**
 * Rough per-run cost estimates in USD, by provider, used to stamp
 * usage_events.estimated_cost_usd.
 *
 * These are deliberately coarse placeholders for internal attribution and
 * anomaly spotting — tune them against real provider invoices (that
 * comparison is the point of collecting usage_events, not something these
 * numbers replace). Missing provider → null cost, event still recorded.
 *
 * NOTE: These numbers live in the public repository. They are coarse
 * placeholders for internal attribution — if they ever approach public
 * list prices, move them to config/env so they remain internal.
 */

const PROVIDER_COST_ESTIMATES_USD: Record<string, number> = {
	olostep: 0.01,
	brightdata: 0.01,
	oxylabs: 0.01,
	cloro: 0.01,
	dataforseo: 0.005,
	"openai-api": 0.01,
	"anthropic-api": 0.015,
	"mistral-api": 0.005,
	openrouter: 0.005,
	stub: 0,
};

/** Anthropic bills native web search per use (plus tokens); max_uses is 1. */
const ANTHROPIC_WEB_SEARCH_SURCHARGE_USD = 0.01;

export function estimateRunCostUsd(provider: string | null, webSearchEnabled: boolean): number | null {
	if (!provider) return null;
	const base = PROVIDER_COST_ESTIMATES_USD[provider];
	if (base === undefined) return null;
	if (provider === "anthropic-api" && webSearchEnabled) {
		return base + ANTHROPIC_WEB_SEARCH_SURCHARGE_USD;
	}
	return base;
}

/** Days per month used for cost projections — a flat 30, not a calendar month. */
export const PROJECTION_DAYS_PER_MONTH = 30;

/**
 * What one target costs to keep running for a month, at a brand's current
 * prompt count and cadence: every enabled prompt fires the target `runsPerDay`
 * times, each firing making `replication` provider calls.
 *
 * Self-hosted only. It exists to answer "what does adding this platform cost
 * me", so it inherits the coarseness of the per-provider estimates above and
 * should be presented as an estimate.
 */
export function projectMonthlyTargetCostUsd(input: {
	costPerRunUsd: number | null;
	enabledPrompts: number;
	runsPerDay: number;
	replication: number;
}): number | null {
	if (input.costPerRunUsd === null) return null;
	const runs = input.enabledPrompts * input.runsPerDay * input.replication * PROJECTION_DAYS_PER_MONTH;
	return input.costPerRunUsd * runs;
}
