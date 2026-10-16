/**
 * The Jev decision model from TypeSafe (https://typesafe.ai), which judges every answer: one request
 * per answer, with a choice question per company for its mention and sentiment and another for the
 * passage that shows it. Questions are answered independently against the same state.
 */

/** Pinned: a new Jev version changes judgements, so moving to one is a deliberate re-judge. */
export const JEV_MODEL = "jev-1.13.0";
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 60_000;

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

/** Calls the API; a failure throws, so the derivation job retries it. */
export function typesafeTransport(apiKey: string, fetchImpl: typeof fetch = fetch): JevTransport {
	return async (request) => {
		const response = await fetchImpl(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
			body: JSON.stringify(request),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (!response.ok) {
			const detail = (await response.text().catch(() => "")).slice(0, 300);
			throw new Error(`Jev returned HTTP ${response.status}: ${detail}`);
		}
		const body = (await response.json()) as JevResponse;
		for (const key of Object.keys(request.questions)) {
			if (!body.answers?.[key]?.probabilities) throw new Error(`Jev returned no answer to "${key}"`);
		}
		return body;
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
