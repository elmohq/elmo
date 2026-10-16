import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBrandMentionQuality, getBrandShareOfVoice } from "@/server/analytics-core";
import { findRunDetail, listPromptRuns } from "@/server/runs-core";
import {
	createBrand,
	createCompetitor,
	createPrompt,
	createRun,
	deleteBrand,
	rebuildRollups,
} from "@/test/integration/stats-fixtures";

const ANSWER = "For small teams, Acme is the easiest pick. Globex is cheaper but clunky.";
const window = { from: "2026-03-01", to: "2026-03-02", timezone: "UTC" };

let brandId: string;
let promptId: string;
let judgedRunId: string;
let unjudgedRunId: string;

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example" });
	promptId = await createPrompt(brandId);
	await createCompetitor(brandId, "Globex");
	const judged = await createRun(brandId, promptId, {
		at: "2026-03-01T10:00:00Z",
		brandMentioned: true,
		competitors: ["Globex"],
		text: ANSWER,
		assessments: {
			brand: {
				mentioned: true,
				probability: 0.97,
				sentiment: "positive",
				sentimentProbabilities: { positive: 0.9, neutral: 0.06, negative: 0.02, mixed: 0.02 },
				passage: { start: 0, end: 42 },
				firstMention: 17,
				mentionCount: 1,
				position: 1,
			},
			competitors: {
				Globex: {
					mentioned: true,
					probability: 0.55,
					passage: { start: 43, end: 72 },
					firstMention: 43,
					mentionCount: 1,
					position: 2,
				},
			},
			judged: { brand: "brand-fingerprint", competitors: { Globex: "globex-fingerprint" } },
		},
	});
	judgedRunId = judged.id;
	const unjudged = await createRun(brandId, promptId, {
		at: "2026-03-02T10:00:00Z",
		brandMentioned: true,
		competitors: ["Globex"],
	});
	unjudgedRunId = unjudged.id;
	await rebuildRollups(brandId);
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("run assessments", () => {
	it("gives a single run each assessment, without the passages it rests on", async () => {
		const run = await findRunDetail(promptId, judgedRunId);
		expect(run?.assessments?.brand).toEqual({
			mentioned: true,
			probability: 0.97,
			reason: null,
			sentiment: "positive",
			sentimentProbabilities: { positive: 0.9, neutral: 0.06, negative: 0.02, mixed: 0.02 },
			position: 1,
			mentionCount: 1,
		});
		expect(run?.assessments?.competitors.Globex).toMatchObject({
			mentioned: true,
			reason: null,
			sentiment: null,
		});
		expect(run?.assessments?.competitors.Globex).not.toHaveProperty("passage");
	});

	it("lists assessments, and none for runs the judge never saw", async () => {
		const { data } = await listPromptRuns({ promptId, window, limit: 10, offset: 0 });
		const byId = new Map(data.map((run) => [run.id, run]));
		expect(byId.get(judgedRunId)?.assessments?.brand).not.toHaveProperty("passage");
		expect(byId.get(judgedRunId)?.assessments?.brand?.sentiment).toBe("positive");
		expect(byId.get(unjudgedRunId)?.assessments).toBeNull();
	});
});

describe("mention quality", () => {
	it("totals the brand's sentiment and position over the window, day by day", async () => {
		const { sentiment, position } = await getBrandMentionQuality(brandId, window);
		expect(sentiment).toMatchObject({
			positive: 1,
			neutral: 0,
			negative: 0,
			mixed: 0,
			score: 1,
		});
		expect(sentiment.series.find((day) => day.date === "2026-03-01")).toMatchObject({ positive: 1 });
		expect(position.average).toBe(1);
		expect(position.series.find((day) => day.date === "2026-03-02")?.average).toBeNull();
	});

	it("gives each share-of-voice entry its own sentiment and position", async () => {
		const { entries } = await getBrandShareOfVoice(brandId, window);
		const brand = entries.find((entry) => entry.isBrand);
		const globex = entries.find((entry) => entry.name === "Globex");
		expect(brand).toMatchObject({ position: { average: 1 }, sentiment: { positive: 1 } });
		// It has no sentiment, so it counts in no sentiment, but it was still named second.
		expect(globex).toMatchObject({ position: { average: 2 }, sentiment: { score: null } });
	});
});
