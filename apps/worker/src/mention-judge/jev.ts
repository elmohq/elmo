import { type JudgedEntity, type Judgment, type MentionJudge, REFERENCE_LABELS, SENTIMENT_LABELS } from "./judge";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
/** Jev answers in ~300 ms p50; anything near this is a fault worth retrying. */
const TIMEOUT_MS = 5000;
const ATTEMPTS = 4;

// The wording the label set was evaluated with; Jev reads these, so they are its whole definition of each label.
const REFERENCE_CRITERIA: Record<string, string> = {
	brand:
		"The prose refers to the tracked company, its products, its stores or its website (a domain written in prose counts), including negative statements about it.",
	other_meaning:
		"The matched name is only an ordinary word, part of a longer word, or a generic concept, not this company.",
	other_company:
		"The name refers to a different company, product or person that merely shares the name with the tracked company.",
	link_only: "The name appears only inside a URL, link target or citation, never in the prose.",
	no_info: "The passage says it cannot find, does not know, or has no reliable information about the tracked company.",
};
const SENTIMENT_CRITERIA: Record<string, string> = {
	positive: "Recommended, praised, listed as a good or best option, described favourably.",
	neutral: "Mentioned factually without evaluation: where to buy, what it sells, a price or spec, a plain list.",
	negative: "Criticised, warned against, complaints, recalls, poor quality, overpriced, or compared unfavourably.",
	mixed: "Clear positives and clear negatives of similar weight.",
};

const QUESTIONS = {
	reference: {
		type: "choice",
		instructions: "The name of `tracked_entity` was found in `passage`. What does the passage's use of it refer to?",
		criteria: REFERENCE_CRITERIA,
	},
	sentiment: {
		type: "choice",
		instructions: "How does `passage` portray `tracked_entity` specifically (not other brands, not the overall tone)?",
		criteria: SENTIMENT_CRITERIA,
	},
};

interface JevResponse {
	answers: Record<string, { probabilities: Record<string, number> }>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function checked(probabilities: Record<string, number> | undefined, labels: string[]): Record<string, number> {
	const sum = labels.reduce((total, label) => total + (probabilities?.[label] ?? Number.NaN), 0);
	if (!(Math.abs(sum - 1) < 1e-3))
		throw new Error(`Jev returned unexpected probabilities: ${JSON.stringify(probabilities)}`);
	return Object.fromEntries(labels.map((label) => [label, probabilities?.[label] ?? 0]));
}

function requestBody(entity: JudgedEntity, passage: string): string {
	return JSON.stringify({
		model: MODEL,
		state: {
			passage,
			tracked_entity: {
				name: entity.name,
				also_known_as: entity.aliases ?? [],
				domains: entity.domains ?? [],
				top_competitors: entity.competitors?.slice(0, 5) ?? [],
			},
		},
		questions: QUESTIONS,
	});
}

/** Null for a network error or timeout, which is retried like a 5xx. */
async function attempt(fetchImpl: typeof fetch, apiKey: string, body: string): Promise<Response | null> {
	try {
		return await fetchImpl(ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
			body,
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		return null;
	}
}

/**
 * The TypeSafe Jev API as a mention judge, for deployments that would rather pay per call than
 * spend CPU: it is network-bound, so many calls can run at once.
 */
export function jevJudge(apiKey: string, fetchImpl: typeof fetch = fetch): MentionJudge {
	async function ask(entity: JudgedEntity, passage: string): Promise<JevResponse> {
		const body = requestBody(entity, passage);
		for (let tries = 1; ; tries++) {
			const response = await attempt(fetchImpl, apiKey, body);
			if (response?.ok) return (await response.json()) as JevResponse;
			const retryable = !response || RETRYABLE.has(response.status);
			if (!retryable || tries >= ATTEMPTS) {
				const detail = response ? `${response.status} ${(await response.text()).slice(0, 300)}` : "no response";
				throw new Error(`Jev request failed: ${detail}`);
			}
			await new Promise((resolve) => setTimeout(resolve, 2 ** tries * 250));
		}
	}

	return {
		version: MODEL,
		async judge(entity, passage): Promise<Judgment> {
			const { answers } = await ask(entity, passage);
			return {
				reference: checked(answers.reference?.probabilities, REFERENCE_LABELS),
				sentiment: checked(answers.sentiment?.probabilities, SENTIMENT_LABELS),
			};
		},
	};
}
