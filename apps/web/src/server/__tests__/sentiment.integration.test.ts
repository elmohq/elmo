import type { MentionAssessment, RunMentionAssessments } from "@workspace/lib/mentions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getResponseMatches, getResponseSentimentCounts, type ResponseSearchScope } from "@/lib/postgres-read";
import type { Sentiment } from "@/lib/sentiment";
import { getBrandSentiment, getCompetitiveLandscape } from "@/server/analytics-core";
import { createBrand, createPrompt, createRun, deleteBrand, rebuildRollups } from "@/test/integration/stats-fixtures";

const window = { from: "2026-03-01", to: "2026-03-03", timezone: "UTC" };

let brandId: string;
let scope: ResponseSearchScope;
const runIds: Record<string, string> = {};

const judged = (
	text: string,
	passage: string,
	sentiment: Sentiment,
	confidence: number,
): { text: string; assessments: RunMentionAssessments } => {
	const start = text.indexOf(passage);
	const brand: MentionAssessment = {
		mentioned: true,
		probability: 0.99,
		sentiment,
		sentimentProbabilities: { [sentiment]: confidence },
		passage: { start, end: start + passage.length },
		position: 1,
	};
	return { text, assessments: { brand, competitors: {}, judged: { brand: "acme", competitors: {} } } };
};

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example" });
	const pricing = await createPrompt(brandId, { value: "acme pricing" });
	const setup = await createPrompt(brandId, { value: "easiest crm to set up" });
	const reviews = await createPrompt(brandId, { value: "acme reviews" });
	// A link-only mention has no passage, so there's nothing to quote.
	const unquotable = judged("Acme is loved.", "Acme is loved.", "positive", 0.99);
	const unquotableBrand = unquotable.assessments.brand;
	if (unquotableBrand) unquotableBrand.passage = undefined;

	const runs: [key: string, prompt: string, at: string, mentioned: boolean, assessment?: ReturnType<typeof judged>][] =
		[
			[
				"sureNegative",
				pricing,
				"2026-03-01T10:00:00Z",
				true,
				judged(
					"Intro. Acme raised prices twice last year. Outro.",
					"Acme raised prices twice last year.",
					"negative",
					0.95,
				),
			],
			[
				"unsureNegative",
				pricing,
				"2026-03-02T10:00:00Z",
				true,
				judged("Acme costs a bit more than most.", "Acme costs a bit more than most.", "negative", 0.6),
			],
			[
				"mixed",
				setup,
				"2026-03-02T11:00:00Z",
				true,
				judged("Acme is easy, though pricey.", "Acme is easy, though pricey.", "mixed", 0.8),
			],
			[
				"positive",
				setup,
				"2026-03-03T10:00:00Z",
				true,
				judged("Acme is the easiest CRM to set up.", "Acme is the easiest CRM to set up.", "positive", 0.97),
			],
			[
				"unmentioned",
				setup,
				"2026-03-03T11:00:00Z",
				false,
				{ text: "Globex is fine.", assessments: { competitors: {}, judged: { brand: "acme", competitors: {} } } },
			],
			// Matched without the judge, so it counts as a mention but has no sentiment.
			["withoutSentiment", pricing, "2026-03-03T12:00:00Z", true],
			["unquotable", reviews, "2026-03-02T09:00:00Z", true, unquotable],
			[
				"quotable",
				reviews,
				"2026-03-01T09:00:00Z",
				true,
				judged("Reviewers love Acme.", "Reviewers love Acme.", "positive", 0.8),
			],
		];
	for (const [key, prompt, at, brandMentioned, assessment] of runs) {
		const run = await createRun(brandId, prompt, { at, brandMentioned, ...assessment });
		runIds[key] = run.id;
	}
	await rebuildRollups(brandId);
	scope = { brandId, ...window, promptIds: [pricing, setup] };
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("responses by sentiment", () => {
	it("counts every run in scope by its sentiment toward the brand", async () => {
		expect(await getResponseSentimentCounts(scope)).toEqual({
			positive: 1,
			neutral: 0,
			mixed: 1,
			negative: 2,
			unmentioned: 1,
			all: 6,
		});
	});

	it("narrows the list to one sentiment, or to answers that don't mention the brand", async () => {
		const negative = await getResponseMatches({ ...scope, sentiment: "negative" }, 10, 0);
		expect(negative.map((row) => row.id).sort()).toEqual([runIds.sureNegative, runIds.unsureNegative].sort());
		expect(negative[0].matched).toBe(2);
		const unmentioned = await getResponseMatches({ ...scope, sentiment: "unmentioned" }, 10, 0);
		expect(unmentioned.map((row) => row.id)).toEqual([runIds.unmentioned]);
	});

	it("puts the surest negative assessments first, and runs without a sentiment last", async () => {
		const rows = await getResponseMatches(scope, 10, 0, "negative");
		expect(rows.map((row) => row.id)).toEqual([
			runIds.sureNegative,
			runIds.unsureNegative,
			runIds.mixed,
			runIds.positive,
			runIds.withoutSentiment,
			runIds.unmentioned,
		]);
	});

	it("puts positive assessments first when sorting by most positive", async () => {
		const rows = await getResponseMatches(scope, 1, 0, "positive");
		expect(rows.map((row) => row.id)).toEqual([runIds.positive]);
	});
});

describe("brand sentiment", () => {
	it("splits the current answers by sentiment from each prompt's latest day, as every headline does", async () => {
		const brand = (await getCompetitiveLandscape(brandId, window)).companies[0];
		// Pricing's latest answer has no sentiment; set-up's and reviews' latest are positive.
		expect(brand.sentiments).toEqual({ positive: 2, neutral: 0, mixed: 0, negative: 0 });
		expect(brand.totals.sentiment).toBe(1);
	});

	it("scores each prompt's sentiment over the whole period, lowest first", async () => {
		const sentiment = await getBrandSentiment(brandId, window);
		// A mixed answer scores halfway, as a neutral one does.
		expect(sentiment.prompts.map((p) => [p.value, p.sentiment.score])).toEqual([
			["acme pricing", 0],
			["easiest crm to set up", 0.75],
			["acme reviews", 1],
		]);
	});

	it("quotes the passage behind the surest assessment on each side, one per prompt", async () => {
		const { criticism, mixed, praise } = await getBrandSentiment(brandId, window);
		expect(criticism.map((q) => q.passage)).toEqual(["Acme raised prices twice last year."]);
		expect(mixed.map((q) => q.passage)).toEqual(["Acme is easy, though pricey."]);
		// A prompt whose surest assessment has no passage to quote falls back to its next one.
		expect(praise.map((q) => [q.prompt, q.passage])).toEqual([
			["easiest crm to set up", "Acme is the easiest CRM to set up."],
			["acme reviews", "Reviewers love Acme."],
		]);
	});
});
