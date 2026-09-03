/**
 * Plumbing shared by the scraper providers. They all reach an answer engine the
 * same way — submit a job, poll it on a backoff until it settles, then map a
 * loosely-typed payload — so the polling schedule, the transient-failure rules,
 * and the payload readers live here rather than once per vendor.
 */

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const POLL_BASE_DELAY_MS = 2000;
const POLL_MAX_DELAY_MS = 10_000;

/**
 * How long to wait before the next status poll. Answers take anywhere from
 * seconds to minutes, so the delay widens every five attempts and then holds,
 * which keeps a fast answer responsive without hammering a slow one.
 */
export function pollDelay(attempt: number): number {
	return Math.min(POLL_BASE_DELAY_MS * 2 ** Math.floor(attempt / 5), POLL_MAX_DELAY_MS);
}

/** Statuses worth another attempt rather than failing the run. */
export function isTransientStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

/** A failed HTTP response as a short one-line cause, safe to put in an error. */
export async function responseError(res: Response): Promise<string> {
	return `${res.status}: ${(await res.text()).slice(0, 500)}`.trim();
}

/** A vendor's free-form failure detail as a parenthesized suffix, or "". */
export function failureDetails(detail: unknown): string {
	if (detail === undefined || detail === null) return "";
	const serialized = typeof detail === "string" ? detail : JSON.stringify(detail);
	return serialized ? ` (${serialized.slice(0, 500)})` : "";
}

/** Every usable string in a field that should hold a list of them. */
export function nonEmptyStrings(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

/**
 * Queries from the first of `keys` the payload actually populates. Surfaces
 * report the model's searches under different names, and a present-but-empty
 * field means "this surface names it that but ran nothing here".
 */
export function queriesFromKeys(payload: Record<string, any>, keys: readonly string[]): string[] {
	for (const key of keys) {
		const queries = nonEmptyStrings(payload[key]);
		if (queries.length > 0) return queries;
	}
	return [];
}

/** Round-trip through JSON so a vendor SDK's class instances store as plain data. */
export function sanitizeForJson(obj: unknown): unknown {
	return JSON.parse(JSON.stringify(obj));
}

export type Attempt<T> = { result: T } | { error: string };

const TRANSIENT_RETRY_ATTEMPTS = 3;
const TRANSIENT_RETRY_BASE_DELAY_MS = 1500;

/**
 * Retry a call whose upstream fails intermittently for reasons a second try
 * clears (an edge error page, a task-level "Internal SE Server Error"). The
 * caller reports failure as data rather than throwing so a run is only abandoned
 * once every attempt is spent, with `describeExhausted` naming the last cause.
 */
export async function retryTransient<T>(
	attempt: (attemptIndex: number) => Promise<Attempt<T>>,
	describeExhausted: (lastError: string) => string,
): Promise<T> {
	let lastError = "";
	for (let i = 0; i < TRANSIENT_RETRY_ATTEMPTS; i++) {
		const outcome = await attempt(i);
		if ("result" in outcome) return outcome.result;
		lastError = outcome.error;
		if (i < TRANSIENT_RETRY_ATTEMPTS - 1) await sleep(TRANSIENT_RETRY_BASE_DELAY_MS * (i + 1));
	}
	throw new Error(describeExhausted(lastError));
}
