export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const POLL_BASE_DELAY_MS = 2000;
const POLL_MAX_DELAY_MS = 10_000;

/** Answers take anywhere from seconds to minutes, so the delay widens and then holds. */
export function pollDelay(attempt: number): number {
	return Math.min(POLL_BASE_DELAY_MS * 2 ** Math.floor(attempt / 5), POLL_MAX_DELAY_MS);
}

export function isTransientStatus(status: number): boolean {
	return status === 408 || status === 429 || status >= 500;
}

export async function responseError(res: Response): Promise<string> {
	return `${res.status}: ${(await res.text()).slice(0, 500)}`.trim();
}

export function failureDetails(detail: unknown): string {
	if (detail === undefined || detail === null) return "";
	const serialized = typeof detail === "string" ? detail : JSON.stringify(detail);
	return serialized ? ` (${serialized.slice(0, 500)})` : "";
}

export function nonEmptyStrings(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

/** Surfaces report the model's searches under different names, so try each in turn. */
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
 * For upstreams that fail intermittently for reasons a second try clears (an
 * edge error page, a task-level "Internal SE Server Error").
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

const GROUNDING_REDIRECT_PREFIX = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";
const GROUNDING_REDIRECT_TIMEOUT_MS = 8000;

async function resolveGroundingRedirect(url: string): Promise<string> {
	try {
		const res = await fetch(url, {
			method: "GET",
			redirect: "manual",
			signal: AbortSignal.timeout(GROUNDING_REDIRECT_TIMEOUT_MS),
		});
		const location = res.headers.get("location");
		return location?.startsWith("http") ? location : url;
	} catch {
		return url;
	}
}

/**
 * Gemini grounds its answers through Google Search and cites each source as a
 * Vertex AI "grounding-api-redirect" link rather than the page itself, whoever
 * makes the call (Google's own API, or a reseller like DataForSEO). The links
 * are short-lived, so they're followed at fetch time and `entry[field]` is
 * rewritten in place — the stored payload, and every later re-extraction of it,
 * then carries the real source URL. A link that won't resolve keeps its
 * redirect URL rather than failing the run.
 */
export async function resolveGroundingRedirects<K extends string>(
	entries: Partial<Record<K, unknown>>[],
	field: K,
): Promise<void> {
	const redirected = entries.filter(
		(entry): entry is Record<K, string> =>
			typeof entry?.[field] === "string" && (entry[field] as string).startsWith(GROUNDING_REDIRECT_PREFIX),
	);
	if (redirected.length === 0) return;

	const resolved = new Map<string, string>();
	await Promise.all(
		[...new Set(redirected.map((entry) => entry[field]))].map(async (url) =>
			resolved.set(url, await resolveGroundingRedirect(url)),
		),
	);
	for (const entry of redirected) {
		entry[field] = resolved.get(entry[field]) ?? entry[field];
	}
}
