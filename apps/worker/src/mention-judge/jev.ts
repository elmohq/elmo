/** Jev, from TypeSafe (https://typesafe.ai). Each question is answered independently against the same state. */

/** Pinned: a new Jev version changes judgements, so moving to one is a deliberate re-judge. */
export const JEV_MODEL = "jev-1.13.0";
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
/** Jev answers in a second or two; a chunk's job expiry allows this for every run in it. */
export const TIMEOUT_MS = 30_000;

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
const RATE_LIMIT_RETRIES = 4;
const MAX_RETRY_WAIT_MS = 30_000;

/** A failure throws, so the derivation job retries it; a rate limit is waited out here first. */
export function typesafeTransport(apiKey: string, fetchImpl: typeof fetch = fetch, wait = sleep): JevTransport {
	const post = (request: JevRequest) =>
		fetchImpl(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	return async (request) => {
		let response = await post(request);
		for (let attempt = 0; response.status === 429 && attempt < RATE_LIMIT_RETRIES; attempt++) {
			const retryAfter = Number(response.headers.get("retry-after"));
			await wait(Math.min(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt, MAX_RETRY_WAIT_MS));
			response = await post(request);
		}
		return answered(request, response);
	};
}

async function answered(request: JevRequest, response: Response): Promise<JevResponse> {
	if (!response.ok) {
		const detail = (await response.text().catch(() => "")).slice(0, 300);
		if (response.status === 401 || response.status === 403)
			throw new Error(`TYPESAFE_API_KEY was rejected (HTTP ${response.status}); check it, or its credit: ${detail}`);
		throw new Error(`Jev returned HTTP ${response.status}: ${detail}`);
	}
	const body = (await response.json()) as JevResponse;
	for (const key of Object.keys(request.questions)) {
		const answer = body.answers?.[key];
		if (typeof answer?.choice !== "string" || !Object.keys(answer.probabilities ?? {}).length)
			throw new Error(`Jev returned no answer to "${key}"`);
	}
	return body;
}

/** Measured against Jev's reported usage. */
const CHARS_PER_TOKEN = 3.3;

/** Roughly the input tokens a request is billed for: the state is billed once per question. */
export function estimatedTokens(request: JevRequest): number {
	const state = JSON.stringify(request.state).length;
	const chars = Object.values(request.questions).reduce(
		(sum, question) => sum + state + JSON.stringify(question).length,
		0,
	);
	return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Keeps a worker under an input-token rate limit whatever Jev's latency: each request waits until
 * the last second's budget has room for it.
 */
export function tokenBudget(
	transport: JevTransport,
	tokensPerSecond: number,
	{ now = Date.now, wait = sleep } = {},
): JevTransport {
	let available = tokensPerSecond;
	let updated = now();
	let turn = Promise.resolve();
	return (request) => {
		const cost = Math.min(estimatedTokens(request), tokensPerSecond);
		const ready = turn.then(async () => {
			for (;;) {
				const at = now();
				available = Math.min(tokensPerSecond, available + ((at - updated) / 1000) * tokensPerSecond);
				updated = at;
				if (available >= cost) {
					available -= cost;
					return;
				}
				await wait(Math.ceil(((cost - available) / tokensPerSecond) * 1000));
			}
		});
		turn = ready;
		return ready.then(() => transport(request));
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
