import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBrandSentiment } from "@/server/analytics-core";
import { findRunDetail, listPromptRuns } from "@/server/runs-core";
import { createBrand, createPrompt, createRun, deleteBrand, rebuildRollups } from "@/test/integration/stats-fixtures";

const ANSWER = "For small teams, Acme is the easiest pick. Globex is cheaper but clunky.";
const window = { from: "2026-03-01", to: "2026-03-02", timezone: "UTC" };

let brandId: string;
let promptId: string;
let judgedRunId: string;
let unjudgedRunId: string;

beforeAll(async () => {
	brandId = await createBrand({ name: "Acme", website: "https://acme.example" });
	promptId = await createPrompt(brandId);
	const judged = await createRun(brandId, promptId, {
		at: "2026-03-01T10:00:00Z",
		brandMentioned: true,
		competitors: ["Globex"],
		text: ANSWER,
		assessments: {
			brand: {
				mention: "mentioned",
				probability: 0.97,
				sentiment: "positive",
				sentimentProbabilities: { positive: 0.9, neutral: 0.06, negative: 0.02, mixed: 0.02 },
				evidence: { start: 0, end: 42 },
			},
			competitors: {
				Globex: { mention: "uncertain", probability: 0.55, reason: "other_company", evidence: { start: 43, end: 72 } },
			},
		},
	});
	judgedRunId = judged.id;
	const unjudged = await createRun(brandId, promptId, { at: "2026-03-02T10:00:00Z", brandMentioned: true });
	unjudgedRunId = unjudged.id;
	await rebuildRollups(brandId);
});

afterAll(async () => {
	await deleteBrand(brandId);
});

describe("run verdicts", () => {
	it("gives a single run each verdict with the passage it rests on", async () => {
		const run = await findRunDetail(promptId, judgedRunId);
		expect(run?.assessments?.brand).toEqual({
			mention: "mentioned",
			probability: 0.97,
			reason: null,
			sentiment: "positive",
			sentimentProbabilities: { positive: 0.9, neutral: 0.06, negative: 0.02, mixed: 0.02 },
			evidence: "For small teams, Acme is the easiest pick.",
		});
		expect(run?.assessments?.competitors.Globex).toMatchObject({
			mention: "uncertain",
			reason: "other_company",
			sentiment: null,
			evidence: "Globex is cheaper but clunky.",
		});
	});

	it("lists verdicts without passages, and none for runs the judge never saw", async () => {
		const { data } = await listPromptRuns({ promptId, window, limit: 10, offset: 0 });
		const byId = new Map(data.map((run) => [run.id, run]));
		expect(byId.get(judgedRunId)?.assessments?.brand).not.toHaveProperty("evidence");
		expect(byId.get(judgedRunId)?.assessments?.brand?.sentiment).toBe("positive");
		expect(byId.get(unjudgedRunId)?.assessments).toBeNull();
	});
});

describe("getBrandSentiment", () => {
	it("counts the answers mentioning the brand by sentiment", async () => {
		expect(await getBrandSentiment(brandId, window)).toEqual({ positive: 1, neutral: 0, negative: 0, mixed: 0 });
	});
});
