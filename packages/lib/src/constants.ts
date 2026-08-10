// Constants for prompt processing
export const RUNS_PER_PROMPT = 5;

// Fallback cadence (hours) when the DEFAULT_DELAY_HOURS env var is unset or invalid.
export const DEFAULT_DELAY_HOURS_FALLBACK = 24;

/**
 * Resolves the default prompt cadence (hours) for brands without a
 * delayOverrideHours. Reads DEFAULT_DELAY_HOURS from the environment; falls
 * back to DEFAULT_DELAY_HOURS_FALLBACK when unset, non-numeric, or <= 0.
 *
 * Server-only. Client code should read clientConfig.defaultDelayHours instead
 * of calling this directly — `process` is not defined in browser bundles.
 */
export function getDefaultDelayHours(): number {
	const raw = typeof process !== "undefined" ? process.env.DEFAULT_DELAY_HOURS : undefined;
	if (!raw) return DEFAULT_DELAY_HOURS_FALLBACK;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DELAY_HOURS_FALLBACK;
	return parsed;
}

// Prompt jobs the worker runs at once. Each one fans out to
// RUNS_PER_PROMPT × targets provider calls, so this multiplies straight into
// how much paid work is offered at once; the per-provider gate bounds what
// actually reaches a provider, and extra job slots beyond that only queue.
export const DEFAULT_PROMPT_JOB_CONCURRENCY = 2;

/**
 * How many prompt jobs the worker processes concurrently. Reads
 * PROMPT_JOB_CONCURRENCY; falls back to DEFAULT_PROMPT_JOB_CONCURRENCY when
 * unset, non-numeric, or <= 0.
 *
 * Two is ample for the default 24h cadence — even at the 100-prompt ceiling
 * that's a prompt every fifteen minutes — and keeps a single tenant from
 * offering more work than a small provider plan can absorb. Deployments running
 * many brands against providers with headroom can raise it.
 */
export function getPromptJobConcurrency(): number {
	const raw = typeof process !== "undefined" ? process.env.PROMPT_JOB_CONCURRENCY : undefined;
	if (!raw) return DEFAULT_PROMPT_JOB_CONCURRENCY;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PROMPT_JOB_CONCURRENCY;
	return Math.floor(parsed);
}

// Maximum limits for brand resources
export const MAX_COMPETITORS = 100;
export const MAX_PROMPTS = 100;

/**
 * Sentinel providers store in `prompt_runs.web_queries` when a web search
 * happened (citations prove it) but the provider doesn't expose the actual
 * query strings (OpenRouter always; BrightData/Olostep on extraction failure).
 * Written by the provider implementations and filtered out by every fan-out
 * read path — keep both sides on this constant.
 */
export const WEB_QUERIES_UNAVAILABLE = "unavailable";
