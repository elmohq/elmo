import type { MentionAssessmentRecord, RunMentionAssessments } from "@workspace/lib/mentions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getResponseMatches, getResponseToneCounts, type ResponseSearchScope } from "@/lib/postgres-read";
import type { Tone } from "@/lib/tone";
import { getBrandSentiment } from "@/server/analytics-core";
import { createBrand, createPrompt, createRun, deleteBrand, rebuildRollups } from "@/test/integration/stats-fixtures";

const window = { from: "2026-03-01", to: "2026-03-03", timezone: "UTC" };

let brandId: string;
let scope: ResponseSearchScope;
const runIds: Record<string, string> = {};

const judged = (
	text: string,
	passage: string,
	sentiment: Tone,
	confidence: number,
): { text: string; assessments: RunMentionAssessments } => {
	const start = text.indexOf(passage);
	const brand: MentionAssessmentRecord = {
		mention: "mentioned",
		probability: 0.99,
		sentiment,
		sentimentProbabilities: { [sentiment]: confidence },
		evidence: { start, end: start + passage.length },
		position: 1,
	};
	return { text, assessments: { brand } };
};

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example" });
	const pricing = await createPrompt(brandId, { value: "acme pricing" });
	const setup = await createPrompt(brandId, { value: "easiest crm to set up" });

	const runs: [key: string, prompt: string, at: string, mentioned: boolean, verdict?: ReturnType<typeof judged>][] = [
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
		["unmentioned", setup, "2026-03-03T11:00:00Z", false, { text: "Globex is fine.", assessments: {} }],
		// Matched without the judge, so it counts as a mention but has no tone.
		["untoned", pricing, "2026-03-03T12:00:00Z", true],
	];
	for (const [key, prompt, at, brandMentioned, verdict] of runs) {
		const run = await createRun(brandId, prompt, { at, brandMentioned, ...verdict });
		runIds[key] = run.id;
	}
	await rebuildRollups(brandId);
	scope = { brandId, ...window, promptIds: [pricing, setup] };
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("responses by sentiment", () => {
	it("counts every run in scope by its tone toward the brand", async () => {
		expect(await getResponseToneCounts(scope)).toEqual({
			positive: 1,
			neutral: 0,
			mixed: 1,
			negative: 2,
			unmentioned: 1,
			all: 6,
		});
	});

	it("narrows the list to one tone, or to answers that don't mention the brand", async () => {
		const negative = await getResponseMatches({ ...scope, tone: "negative" }, 10, 0);
		expect(negative.map((row) => row.id).sort()).toEqual([runIds.sureNegative, runIds.unsureNegative].sort());
		expect(negative[0].matched).toBe(2);
		const unmentioned = await getResponseMatches({ ...scope, tone: "unmentioned" }, 10, 0);
		expect(unmentioned.map((row) => row.id)).toEqual([runIds.unmentioned]);
	});

	it("puts the surest negative verdicts first, and runs without a tone last", async () => {
		const rows = await getResponseMatches(scope, 10, 0, "negative");
		expect(rows.map((row) => row.id)).toEqual([
			runIds.sureNegative,
			runIds.unsureNegative,
			runIds.mixed,
			runIds.positive,
			runIds.untoned,
			runIds.unmentioned,
		]);
	});

	it("puts positive verdicts first when sorting by most positive", async () => {
		const rows = await getResponseMatches(scope, 1, 0, "positive");
		expect(rows.map((row) => row.id)).toEqual([runIds.positive]);
	});
});

describe("brand sentiment", () => {
	it("summarises the tone of the answers that mention the brand", async () => {
		const sentiment = await getBrandSentiment(brandId, window);
		expect(sentiment.summary).toMatchObject({ positive: 1, mixed: 1, negative: 2, neutral: 0, positiveShare: 0.25 });
		expect(sentiment.prompts.map((p) => [p.value, p.sentiment.positiveShare])).toEqual([
			["acme pricing", 0],
			["easiest crm to set up", 0.5],
		]);
	});

	it("quotes the passage behind the surest verdict on each side, one per prompt", async () => {
		const { criticism, praise } = await getBrandSentiment(brandId, window);
		expect(criticism.map((q) => [q.tone, q.passage])).toEqual([
			["negative", "Acme raised prices twice last year."],
			["mixed", "Acme is easy, though pricey."],
		]);
		expect(praise.map((q) => [q.prompt, q.passage])).toEqual([
			["easiest crm to set up", "Acme is the easiest CRM to set up."],
		]);
	});
});
