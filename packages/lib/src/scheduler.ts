export const DEFAULT_PROMPT_RUN_CONCURRENCY = 6;
export const DEFAULT_PROVIDER_MAX_CONCURRENCY = 6;
export const DEFAULT_PROMPT_MAX_PROVIDER_CALLS = 50;
export const DEFAULT_REPORT_MAX_PROVIDER_CALLS = 1500;
export const DEFAULT_PROVIDER_ATTEMPTS_PER_UNIT = 3;
export const REPORT_GENERATION_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;
export const ANALYZE_BRAND_GENERATION_DEADLINE_MS = 48 * 60 * 60 * 1000;

export const REPORT_QUEUE = "generate-report-v2";
export const ANALYZE_BRAND_QUEUE = "analyze-brand-v2";
export const REPORT_QUEUE_OPTIONS = {
	retryLimit: 10,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 60 * 60,
	expireInSeconds: 24 * 60 * 60,
	heartbeatSeconds: 120,
} as const;
export const ANALYZE_BRAND_QUEUE_OPTIONS = {
	retryLimit: 3,
	retryDelay: 60,
	retryBackoff: true,
	retryDelayMax: 15 * 60,
	expireInSeconds: 15 * 60,
	heartbeatSeconds: 120,
} as const;

export const PROVIDER_FAILURE_THRESHOLD = 5;
export const PROVIDER_TRANSIENT_COOLDOWNS_MS = [5, 15, 60, 6 * 60].map((minutes) => minutes * 60 * 1000);
export const PROVIDER_FATAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const PROVIDER_TASK_RESUME_BACKOFF_MS = [30, 2 * 60, 10 * 60, 30 * 60, 60 * 60].map((seconds) => seconds * 1000);

function integerEnv(name: string, fallback: number, minimum: number): number {
	const raw = typeof process !== "undefined" ? process.env[name] : undefined;
	if (raw === undefined) return fallback;
	const parsed = Number(raw);
	if (!Number.isSafeInteger(parsed) || parsed < minimum) {
		throw new Error(`${name} must be an integer greater than or equal to ${minimum}; received ${JSON.stringify(raw)}`);
	}
	return parsed;
}

/** Local work slots. Fleet-wide provider admission is enforced separately in PostgreSQL. */
export function getPromptRunConcurrency(): number {
	return integerEnv("PROMPT_RUN_CONCURRENCY", DEFAULT_PROMPT_RUN_CONCURRENCY, 1);
}

/** Maximum accepted or in-flight calls for one provider across all worker replicas. */
export function getProviderMaxConcurrency(): number {
	return integerEnv("PROVIDER_MAX_CONCURRENCY", DEFAULT_PROVIDER_MAX_CONCURRENCY, 0);
}

/** Hard bound on the paid units materialized by one recurring prompt cycle. */
export function getPromptMaxProviderCalls(): number {
	return integerEnv("PROMPT_MAX_PROVIDER_CALLS", DEFAULT_PROMPT_MAX_PROVIDER_CALLS, 1);
}

/** Hard preflight budget for one report, including its structured analysis call. */
export function getReportMaxProviderCalls(): number {
	return integerEnv("REPORT_MAX_PROVIDER_CALLS", DEFAULT_REPORT_MAX_PROVIDER_CALLS, 0);
}

/** Keep failures for one provider route from being erased by an unrelated route's success. */
export function providerCircuitKey(input: {
	provider: string;
	model: string;
	version?: string | null;
	webSearch?: boolean;
}): string {
	return JSON.stringify([input.provider, input.model, input.version ?? null, input.webSearch ?? false]);
}

/** Escalating admission pause after an execution produces no persisted result. */
export function executionFailureBackoffMs(consecutiveFailures: number): number {
	const exponent = Math.max(0, Math.min(consecutiveFailures - 1, 3));
	return Math.min(24 * 2 ** exponent, 7 * 24) * 60 * 60 * 1000;
}

/**
 * A missed cadence produces one cycle after recovery, never a catch-up burst.
 * The next deadline is anchored to admission time rather than an arbitrarily
 * old due time.
 */
export function nextPromptRunAt(admittedAt: Date, cadenceHours: number): Date {
	if (!Number.isFinite(cadenceHours) || cadenceHours <= 0) {
		throw new Error(`Prompt cadence must be a positive number of hours; received ${cadenceHours}`);
	}
	return new Date(admittedAt.getTime() + cadenceHours * 60 * 60 * 1000);
}

export function transientProviderCooldownMs(consecutiveFailures: number): number | null {
	if (consecutiveFailures < PROVIDER_FAILURE_THRESHOLD) return null;
	const tripCount = consecutiveFailures - PROVIDER_FAILURE_THRESHOLD;
	return PROVIDER_TRANSIENT_COOLDOWNS_MS[Math.min(tripCount, PROVIDER_TRANSIENT_COOLDOWNS_MS.length - 1)];
}

/** Back off repeated polling of the same accepted task without abandoning it. */
export function providerTaskResumeBackoffMs(attemptCount: number): number {
	const index = Math.max(0, Math.min(attemptCount - 1, PROVIDER_TASK_RESUME_BACKOFF_MS.length - 1));
	return PROVIDER_TASK_RESUME_BACKOFF_MS[index];
}
