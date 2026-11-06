/**
 * Coarse per-run estimates for usage_events, to be checked against real invoices.
 * They are public, so if they ever approach list prices, move them to config.
 */

const PROVIDER_COST_ESTIMATES_USD: Record<string, number> = {
	// Exact, not rounded: one flat price per search on every engine.
	searchapi: 0.004,
	olostep: 0.01,
	brightdata: 0.01,
	oxylabs: 0.01,
	cloro: 0.01,
	dataforseo: 0.005,
	"openai-api": 0.01,
	"anthropic-api": 0.01,
	"mistral-api": 0.005,
	openrouter: 0.005,
	stub: 0,
};

// The Anthropic estimate assumes Sonnet 5 pricing and a typical answer length.

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

// A credit's dollar value depends on the account's plan, so it comes from the
// environment rather than being committed here.
const USD_PER_CREDIT_ENV: Record<string, string> = {
	cloro: "CLORO_USD_PER_CREDIT",
};

function usdPerCredit(provider: string | null): number | undefined {
	const envVar = provider ? USD_PER_CREDIT_ENV[provider] : undefined;
	const raw = envVar && typeof process !== "undefined" ? process.env[envVar] : undefined;
	if (!raw) return undefined;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * Providers that only bill calls that return a result: Cloro never charges a
 * FAILED task, and OpenRouter doesn't charge a request that errors.
 */
const BILLS_ONLY_RESULTS = new Set(["cloro", "openrouter"]);

export function runCostUsd(input: {
	provider: string | null;
	webSearchEnabled: boolean;
	billedUsd?: number;
	billedCredits?: number;
}): number | null {
	if (input.billedUsd !== undefined) return input.billedUsd;
	const rate = usdPerCredit(input.provider);
	if (input.billedCredits !== undefined && rate !== undefined) return input.billedCredits * rate;
	return estimateRunCostUsd(input.provider, input.webSearchEnabled);
}

export function failedRunCostUsd(provider: string | null, webSearchEnabled: boolean): number | null {
	if (provider && BILLS_ONLY_RESULTS.has(provider)) return 0;
	return estimateRunCostUsd(provider, webSearchEnabled);
}

export const PROJECTION_DAYS_PER_MONTH = 30;

/** Self-hosted only, and as coarse as the estimates above, so present it as an estimate. */
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
