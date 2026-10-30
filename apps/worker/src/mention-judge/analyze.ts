import {
	type MentionAssessment,
	type MentionConfig,
	type NonMentionReason,
	type RunMentionAssessments,
	type Sentiment,
	subjectFingerprint,
} from "@workspace/lib/mentions";
import { getCredential } from "@workspace/lib/secrets";
import { type Cleaned, cleanAnswer, originalSpan } from "./clean";
import {
	adaptivePool,
	JEV_MODEL,
	type JevChoiceQuestion,
	type JevRequest,
	type JevResponse,
	type JevTransport,
	MAX_IN_FLIGHT,
	OPENROUTER_JEV_MODEL,
	openRouterTransport,
	stubTransport,
	TooLarge,
	typesafeTransport,
} from "./jev";
import { matcher, mentionOffsets, quoteOptions, type Sentence, sentences } from "./passages";

export interface RunMentions {
	brandMentioned: boolean;
	competitorsMentioned: string[];
	assessments: RunMentionAssessments | null;
}

export interface MentionAnalyzer {
	/** Part of the mentions stamp. */
	judgeVersion: string;
	concurrency: number;
	/**
	 * `previous` is what the run already has; subjects judged under an unchanged fingerprint keep
	 * their assessments. Pass it only when the text is the one those assessments were judged on.
	 */
	analyze(
		text: string | null,
		config: MentionConfig,
		previous?: RunMentionAssessments | null,
		question?: string,
	): Promise<RunMentions>;
}

/** About 12k tokens, several times a long answer. */
const MAX_ANSWER_CHARS = 50_000;

/** Bump when the request changes in a way that changes judgements: history is re-judged under it. */
const REQUEST_VERSION = 1;

/** A name the judge can't rule out still counts, so a doubtful judge never hides a real mention. */
const MENTION_THRESHOLD = 0.3;

const RULES =
	"Answer about the one entity named in each question (a company, product, person, organisation or place), using state.answer (an AI assistant's answer to state.question). " +
	"Distinguish it from anything else with the same name, including ordinary words. " +
	"The entity's own products and services count as the entity. " +
	"Judge how the answer portrays that entity specifically, not the overall tone and not other entities.";

const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative", "mixed"];
const REASONS: NonMentionReason[] = ["other_meaning", "other_company", "no_info"];

type Subject = MentionConfig["brand"];

function verdictQuestion(subject: Subject): JevChoiceQuestion {
	const { name, domains } = subject;
	return {
		type: "choice",
		instructions: `How does the answer portray ${name}${domains.length ? ` (website ${domains.join(", ")})` : ""}? A link to its website counts as a mention.`,
		criteria: {
			positive: `${name} or its product is recommended, praised, or described favourably.`,
			neutral: `${name} or its product is mentioned factually without evaluation, or only cited as a source.`,
			negative: `${name} or its product is criticised, warned against, or compared unfavourably.`,
			mixed: `${name} gets clear praise and clear criticism of similar weight.`,
			other_meaning: "The name is used as an ordinary word, not for any entity.",
			other_company: "The name refers to a different entity (company, product, person or place) with the same name.",
			no_info: `The answer says it has no information about ${name}.`,
		},
	};
}

function evidenceQuestion(name: string, passages: Sentence[]): JevChoiceQuestion {
	return {
		type: "choice",
		instructions: `Which passage best represents the answer's sentiment toward ${name}: the one a reader would quote to show how the answer judges ${name}, ideally naming it and giving a reason?`,
		criteria: Object.fromEntries(passages.map((passage, i) => [`p${i + 1}`, passage.text])),
	};
}

const top = <T extends string>(probabilities: Record<string, number>, labels: T[]): T =>
	labels.reduce((best, label) => ((probabilities[label] ?? 0) > (probabilities[best] ?? 0) ? label : best));

function rank(records: (MentionAssessment | undefined)[]): void {
	const placed = records.filter(
		(record): record is MentionAssessment & { firstMention: number } =>
			!!record?.mentioned && record.firstMention !== undefined,
	);
	placed.sort((a, b) => a.firstMention - b.firstMention);
	placed.forEach((record, i) => {
		record.position = i + 1;
	});
}

function assessment(
	answer: string,
	cleaned: Cleaned,
	subject: Subject,
	verdict: Record<string, number>,
	quote: Sentence | undefined,
): MentionAssessment {
	const probability = SENTIMENTS.reduce((sum, label) => sum + (verdict[label] ?? 0), 0);
	const mentioned = probability > MENTION_THRESHOLD;
	const passage = quote ? originalSpan(cleaned, quote.start, quote.end) : undefined;
	const offsets = mentionOffsets(answer, subject);
	return {
		mentioned,
		probability,
		...(mentioned
			? {
					sentiment: top(verdict, SENTIMENTS),
					sentimentProbabilities: Object.fromEntries(
						SENTIMENTS.map((label) => [label, (verdict[label] ?? 0) / probability]),
					),
					...(offsets.length ? { firstMention: offsets[0], mentionCount: offsets.length } : {}),
				}
			: { reason: top(verdict, REASONS) }),
		...(passage ? { passage } : {}),
	};
}

type Entry = ReturnType<typeof subjectsOf>[number];

function subjectsOf(config: MentionConfig, previous: RunMentionAssessments | null | undefined, judgeVersion: string) {
	return [
		{ key: "brand", subject: config.brand, judgedAs: previous?.judged.brand, kept: previous?.brand },
		...config.competitors.map((competitor, i) => ({
			key: `c${i}`,
			subject: competitor,
			judgedAs: previous?.judged.competitors[competitor.name],
			kept: previous?.competitors[competitor.name],
		})),
	].map((entry) => ({
		...entry,
		fingerprint: subjectFingerprint(entry.subject, judgeVersion),
		names: matcher(entry.subject),
	}));
}

function questionsFor(ask: Entry[], named: Entry[], split: Sentence[]) {
	const questions: Record<string, JevChoiceQuestion> = {};
	const options = new Map<string, Sentence[]>();
	for (const entry of ask) {
		const others = named.filter((other) => other !== entry);
		const passages = quoteOptions(split, entry.names, (t) => others.some((other) => other.names(t)));
		options.set(entry.key, passages);
		questions[`${entry.key}__verdict`] = verdictQuestion(entry.subject);
		if (passages.length) questions[`${entry.key}__evidence`] = evidenceQuestion(entry.subject.name, passages);
	}
	return { questions, options };
}

function collect(subjects: Entry[], records: Map<string, MentionAssessment>): RunMentions {
	const brand = records.get("brand");
	const competitors = subjects.slice(1).flatMap((entry) => {
		const record = records.get(entry.key);
		return record ? [[entry.subject.name, record] as const] : [];
	});
	const assessments: RunMentionAssessments = {
		...(brand ? { brand } : {}),
		competitors: Object.fromEntries(competitors),
		judged: {
			brand: subjects[0].fingerprint,
			competitors: Object.fromEntries(subjects.slice(1).map((entry) => [entry.subject.name, entry.fingerprint])),
		},
	};
	// Recomputed every time from the stored first-mention offsets, so a new competitor
	// reorders everyone without re-judging them.
	rank([assessments.brand, ...Object.values(assessments.competitors)]);
	return {
		brandMentioned: !!brand?.mentioned,
		competitorsMentioned: competitors.filter(([, record]) => record.mentioned).map(([name]) => name),
		assessments,
	};
}

const MIN_ANSWER_CHARS = 2_000;

/** Each question is answered independently against the same state, so splitting changes no answer. */
async function askFitting(transport: JevTransport, request: JevRequest): Promise<JevResponse["answers"]> {
	try {
		return (await transport(request)).answers;
	} catch (error) {
		if (!(error instanceof TooLarge)) throw error;
		const companyOf = (key: string) => key.split("__")[0];
		const companies = [...new Set(Object.keys(request.questions).map(companyOf))];
		if (companies.length > 1) {
			const first = new Set(companies.slice(0, Math.ceil(companies.length / 2)));
			const part = (inFirst: boolean): JevRequest => ({
				...request,
				questions: Object.fromEntries(
					Object.entries(request.questions).filter(([key]) => first.has(companyOf(key)) === inFirst),
				),
			});
			const [a, b] = await Promise.all([askFitting(transport, part(true)), askFitting(transport, part(false))]);
			return { ...a, ...b };
		}
		const answer = String(request.state.answer ?? "");
		if (answer.length < MIN_ANSWER_CHARS) throw error;
		const shorter = { ...request.state, answer: answer.slice(0, Math.floor(answer.length / 2)) };
		return askFitting(transport, { ...request, state: shorter });
	}
}

/**
 * `judge` is the stamp, kept apart from the `model` ID a gateway is sent: the same Jev release
 * through another gateway keeps history, while the stub's judgements are re-judged by a real key.
 */
export function jevAnalyzer(
	transport: JevTransport,
	concurrency = 8,
	model = JEV_MODEL,
	judge = model,
): MentionAnalyzer {
	const judgeVersion = `${judge}+request-${REQUEST_VERSION}`;
	return {
		judgeVersion,
		concurrency,
		async analyze(text, config, previous, question) {
			const answer = text ?? "";
			// Bounds the cost of a runaway answer; the companies it names first are the ones asked about.
			const cleaned = cleanAnswer(answer);
			const readable = cleaned.text.slice(0, MAX_ANSWER_CHARS);
			const subjects = subjectsOf(config, previous, judgeVersion);
			// Only companies the answer names are asked about; a company judged under an unchanged
			// fingerprint keeps its assessment, a copy since `rank` rewrites positions.
			const named = subjects.filter((entry) => entry.names(readable));
			// A company named now but not when judged (cleaning or matching changed) is asked about too.
			const ask = named.filter((entry) => entry.judgedAs !== entry.fingerprint || !entry.kept);
			const { questions, options } = questionsFor(ask, named, sentences(readable));
			const request: JevRequest = {
				model,
				state: { rules: RULES, question: question ?? "", answer: readable },
				questions,
			};
			const answers = ask.length ? await askFitting(transport, request) : {};

			const records = new Map<string, MentionAssessment>();
			for (const entry of named) {
				if (!ask.includes(entry)) {
					if (entry.kept) records.set(entry.key, { ...entry.kept });
					continue;
				}
				const quote = options.get(entry.key)?.[Number(answers[`${entry.key}__evidence`]?.choice.slice(1)) - 1];
				records.set(
					entry.key,
					assessment(answer, cleaned, entry.subject, answers[`${entry.key}__verdict`].probabilities, quote),
				);
			}

			return collect(subjects, records);
		},
	};
}

let current: MentionAnalyzer | undefined;

/**
 * A TypeSafe key wins over an OpenRouter one, so setting OPENROUTER_API_KEY for scraping never
 * moves an existing deployment's judge or its bill. The choice is made once: a failing gateway
 * never falls back to the other, which would bill an account the operator didn't pick.
 */
export function configureMentionAnalyzer(
	apiKey = process.env.TYPESAFE_API_KEY,
	openRouterKey: () => string | undefined = () => getCredential("OPENROUTER_API_KEY"),
): MentionAnalyzer {
	if (apiKey?.trim() === "stub") {
		console.warn(
			"[mention-judge] TYPESAFE_API_KEY=stub: judging from cue words, not Jev. For tests and development only.",
		);
		current = jevAnalyzer(stubTransport, 8, "stub");
	} else if (apiKey?.trim()) current = jevAnalyzer(adaptivePool(typesafeTransport(apiKey.trim())), MAX_IN_FLIGHT);
	else if (openRouterKey()?.trim()) {
		console.log("[mention-judge] No TYPESAFE_API_KEY: calling Jev through OpenRouter, billed to OPENROUTER_API_KEY.");
		current = jevAnalyzer(
			adaptivePool(openRouterTransport(() => openRouterKey()?.trim())),
			MAX_IN_FLIGHT,
			OPENROUTER_JEV_MODEL,
			JEV_MODEL,
		);
	} else
		throw new Error(
			"Elmo judges mentions and sentiment with Jev: set TYPESAFE_API_KEY, or OPENROUTER_API_KEY to call Jev through OpenRouter",
		);
	return current;
}

export function mentionAnalyzer(): MentionAnalyzer {
	return current ?? configureMentionAnalyzer();
}
