// Runs per target per firing when the RUNS_PER_PROMPT env var is unset or invalid.
export const RUNS_PER_PROMPT_FALLBACK = 5;

/**
 * How many times a firing runs each of a prompt's targets. Answers vary between
 * identical calls, so sampling several and aggregating is what makes a mention
 * rate a measurement rather than an anecdote — and it multiplies provider spend
 * one-for-one, which is why an operator paying those bills can turn it down.
 *
 * Outside cloud only. Cloud resolves replication from the plan
 * (`Entitlements.replication`), so this is the lever for local, demo and
 * whitelabel deployments, where the operator pays for every call.
 *
 * Server-only, like getDefaultDelayHours: `process` is not defined in browser
 * bundles.
 */
export function getRunsPerPrompt(): number {
	const raw = typeof process !== "undefined" ? process.env.RUNS_PER_PROMPT : undefined;
	if (!raw) return RUNS_PER_PROMPT_FALLBACK;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1) return RUNS_PER_PROMPT_FALLBACK;
	return parsed;
}

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

// Maximum limits for brand resources
export const MAX_COMPETITORS = 100;
export const MAX_PROMPTS = 100;

/**
 * Whether a prompt-editor save may be written, given what the brand already has
 * and how many rows the save introduces. Null means allowed; a string is what
 * the customer is told.
 *
 * The cap governs growth, not what a brand holds. The admin API writes prompts
 * without consulting it, so a brand can legitimately sit above the cap — and
 * refusing its saves would freeze it there, unable to disable a prompt or fix a
 * typo, because the editor submits the brand's whole list on every save. Only a
 * save that adds rows and lands over the cap is refused.
 *
 * Not a plan limit: cloud meters prompts separately through entitlements, and
 * this applies in every deployment mode.
 */
export function promptSaveDenial(input: { existing: number; adding: number; submitted: number }): string | null {
	// The editor can only touch rows the brand has, plus the ones it adds, so a
	// longer list than that is padding rather than an edit.
	if (input.submitted > input.existing + MAX_PROMPTS) {
		return "That save lists more prompts than this brand has.";
	}
	if (input.adding > 0 && input.existing + input.adding > MAX_PROMPTS) {
		return `A brand may have at most ${MAX_PROMPTS} prompts (this one has ${input.existing}).`;
	}
	return null;
}

/**
 * Sentinel providers store in `prompt_runs.web_queries` when a web search
 * happened (citations prove it) but the provider doesn't expose the actual
 * query strings (OpenRouter always; BrightData/Olostep on extraction failure).
 * Written by the provider implementations and filtered out by every fan-out
 * read path — keep both sides on this constant.
 */
export const WEB_QUERIES_UNAVAILABLE = "unavailable";
