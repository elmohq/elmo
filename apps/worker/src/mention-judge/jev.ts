/** Jev, from TypeSafe (https://typesafe.ai). Each question is answered independently against the same state. */

/** Pinned: a new Jev version changes judgements, so moving to one is a deliberate re-judge. */
export const JEV_MODEL = "jev-1.13.0";
/**
 * The same Jev release through OpenRouter, stamped as JEV_MODEL so switching gateway doesn't
 * re-judge history. It's the finest ID OpenRouter offers: it serves a dated 1.13 snapshot that it
 * may move to a newer 1.13 one.
 */
export const OPENROUTER_JEV_MODEL = "typesafe/jev-1.13";
const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/systemone";
const TIMEOUT_MS = 30_000;

export interface JevChoiceQuestion {
	type: "choice";
	instructions: string;
	criteria: Record<string, string>;
}

export interface JevRequest {
	model: string;
	state: Record<string, unknown>;
	questions: Record<string, JevChoiceQuestion>;
}

export interface JevChoice {
	choice: string;
	probabilities: Record<string, number>;
}

export interface JevResponse {
	answers: Record<string, JevChoice>;
	usage?: { input_tokens: number; output_tokens: number };
}

export type JevTransport = (request: JevRequest) => Promise<JevResponse>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Jev turned the request away for the account's rate limit; it's worth sending again after `retryAfterMs`. */
export class RateLimited extends Error {
	constructor(
		readonly retryAfterMs: number,
		detail: string,
	) {
		super(`Jev rate limited the request (HTTP 429): ${detail}`);
	}
}

export class TooLarge extends Error {}

export function typesafeTransport(apiKey: string, fetchImpl: typeof fetch = fetch): JevTransport {
	return systemOneTransport(TYPESAFE_ENDPOINT, () => apiKey, "TYPESAFE_API_KEY", fetchImpl);
}

/** Reads the key on every call, so a key rotated in settings takes effect without a restart. */
export function openRouterTransport(apiKey: () => string | undefined, fetchImpl: typeof fetch = fetch): JevTransport {
	return systemOneTransport(
		OPENROUTER_ENDPOINT,
		() => {
			const key = apiKey();
			// Removed from settings since startup: say so, rather than send no key and report it rejected.
			if (!key) throw new Error("OPENROUTER_API_KEY is no longer set; Elmo calls Jev through OpenRouter with it");
			return key;
		},
		"OPENROUTER_API_KEY",
		fetchImpl,
	);
}

/** A failure throws, so the derivation job retries it. */
function systemOneTransport(
	endpoint: string,
	apiKey: () => string,
	keyName: string,
	fetchImpl: typeof fetch,
): JevTransport {
	return async (request) => {
		const response = await fetchImpl(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) throw await failure(response, keyName);
		const body = (await response.json()) as JevResponse;
		for (const key of Object.keys(request.questions)) {
			const answer = body.answers?.[key];
			if (typeof answer?.choice !== "string" || !Object.keys(answer.probabilities ?? {}).length)
				throw new Error(`Jev returned no answer to "${key}"`);
		}
		return body;
	};
}

async function failure(response: Response, keyName: string): Promise<Error> {
	const body = await response.text().catch(() => "");
	const detail = body.slice(0, 300);
	if (response.status === 429)
		return new RateLimited(Math.min(Number(response.headers.get("retry-after")) * 1000 || 1000, 60_000), detail);
	if (response.status === 400 && body.includes("max_tokens_exceeded"))
		return new TooLarge(`Jev found the request too large (HTTP 400): ${detail}`);
	// OpenRouter answers 402 when the account is out of credit.
	if (response.status === 401 || response.status === 402 || response.status === 403)
		return new Error(`${keyName} was rejected (HTTP ${response.status}); check it, or its credit: ${detail}`);
	return new Error(`Jev returned HTTP ${response.status}: ${detail}`);
}

/** The most calls one worker keeps in flight; its jobs are sized to keep the pool full. */
export const MAX_IN_FLIGHT = 64;

/**
 * Shares Jev among a worker's jobs and finds the account's rate limit by itself, since Jev doesn't
 * report it. Calls start evenly spaced, so bursts don't trip the limit below its average: the rate
 * creeps up while calls succeed and drops by a fifth when Jev rate-limits one, which waits as long
 * as Jev asks and is sent again.
 */
export function adaptivePool(
	transport: JevTransport,
	{ start = 5, max = MAX_IN_FLIGHT, retries = 6, now = Date.now, wait = sleep } = {},
): JevTransport {
	let perSecond = start;
	let nextStart = 0;
	let cutAt = Number.NEGATIVE_INFINITY;
	let roundTripMs = 1000;
	let active = 0;
	const waiting: (() => void)[] = [];
	const admit = () => {
		while (active < max && waiting.length > 0) {
			active++;
			waiting.shift()?.();
		}
	};
	/**
	 * Waits for an evenly spaced start at the current rate. A start reserved before the rate was
	 * cut is reserved again, so calls queued at the old spacing don't overshoot. Returns whether
	 * the pace held the call back, which is the only time a faster pace would help.
	 */
	const paced = async () => {
		let held = false;
		for (;;) {
			const reservedAt = now();
			const at = Math.max(reservedAt, nextStart);
			nextStart = at + 1000 / perSecond;
			if (at > reservedAt) {
				held = true;
				await wait(at - reservedAt);
			}
			if (reservedAt >= cutAt) return { held, reservedAt };
		}
	};
	const succeeded = (sentAt: number, held: boolean) => {
		roundTripMs = 0.9 * roundTripMs + 0.1 * Math.max(1, now() - sentAt);
		// About one more call a second per round trip, while the pace is what limits.
		if (held) perSecond += 1000 / (perSecond * roundTripMs);
	};
	const limited = (reservedAt: number) => {
		// One cut per burst: not for calls reserved before the last cut, and not again within a
		// second of it, since the limit may still count calls from before it.
		if (reservedAt < cutAt || now() - cutAt < 1000) return;
		perSecond = Math.max(0.5, perSecond * 0.8);
		cutAt = now();
		// Starts reserved at the old pace are dropped; their calls reserve again from now.
		nextStart = cutAt;
	};
	return async (request) => {
		await new Promise<void>((resolve) => {
			waiting.push(resolve);
			admit();
		});
		try {
			for (let attempt = 0; ; attempt++) {
				const { held, reservedAt } = await paced();
				const sentAt = now();
				try {
					const response = await transport(request);
					succeeded(sentAt, held);
					return response;
				} catch (error) {
					if (!(error instanceof RateLimited) || attempt >= retries) throw error;
					limited(reservedAt);
					await wait(error.retryAfterMs);
				}
			}
		} finally {
			active--;
			admit();
		}
	};
}

/**
 * For tests and keyless development (`TYPESAFE_API_KEY=stub`): judges each company from cue words
 * in its own passages, so the pipeline runs end to end without calling anyone. Not a model.
 */
export const stubTransport: JevTransport = async (request) => {
	const answers: Record<string, JevChoice> = {};
	for (const [key, question] of Object.entries(request.questions)) {
		const options = Object.keys(question.criteria);
		const evidence = request.questions[key.replace("__verdict", "__evidence")];
		const weights = key.endsWith("__evidence")
			? { [options[0]]: 1 }
			: stubVerdict(Object.values(evidence?.criteria ?? {}).join(" "));
		const rest =
			(1 - Object.values(weights).reduce((sum, p) => sum + p, 0)) / (options.length - Object.keys(weights).length || 1);
		const probabilities = Object.fromEntries(options.map((o) => [o, weights[o] ?? rest]));
		answers[key] = { choice: Object.entries(probabilities).sort((x, y) => y[1] - x[1])[0][0], probabilities };
	}
	return { answers };
};

function stubVerdict(text: string): Record<string, number> {
	if (/no information/i.test(text)) return { no_info: 0.9 };
	if (/\bfruit\b/i.test(text)) return { other_meaning: 0.9 };
	// Can't call it either way: still counts as a mention.
	if (/\bperhaps\b/i.test(text)) return { neutral: 0.5, other_company: 0.44 };
	if (/\b(terrible|avoid|worst)\b/i.test(text)) return { negative: 0.9 };
	if (/\b(great|best|recommend\w*|excellent)\b/i.test(text)) return { positive: 0.9 };
	return { neutral: 0.9 };
}
