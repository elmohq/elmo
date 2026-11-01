import { describe, expect, it } from "vitest";
import {
	type AssessmentSums,
	averagePosition,
	isSentiment,
	mentionQuality,
	NO_ASSESSMENTS,
	sentimentSummary,
	sentimentTotal,
	sumAssessments,
} from "@/lib/sentiment";

const sums = (overrides: Partial<AssessmentSums> = {}): AssessmentSums => ({
	...NO_ASSESSMENTS,
	...overrides,
});

describe("isSentiment", () => {
	it.each(["positive", "neutral", "mixed", "negative"])("accepts %s", (value) => {
		expect(isSentiment(value)).toBe(true);
	});

	it.each([
		["a mention with no sentiment", "unmentioned"],
		["the wrong case", "Positive"],
		["an empty string", ""],
		["undefined", undefined],
		["null", null],
		["a non-string", 1],
	])("rejects %s", (_label, value) => {
		expect(isSentiment(value)).toBe(false);
	});
});

describe("sentimentTotal", () => {
	it("adds up the answers in every sentiment", () => {
		expect(sentimentTotal({ positive: 3, neutral: 2, mixed: 1, negative: 4 })).toBe(10);
	});
});

describe("averagePosition", () => {
	it("has no average when the company was never ranked", () => {
		expect(averagePosition(0, 0)).toBeNull();
		expect(averagePosition(5, 0)).toBeNull();
	});

	it("rounds the average to one decimal", () => {
		expect(averagePosition(5, 3)).toBe(1.7);
		expect(averagePosition(7, 3)).toBe(2.3);
	});

	it("keeps a whole-number average whole", () => {
		expect(averagePosition(6, 3)).toBe(2);
	});
});

describe("sumAssessments", () => {
	it("is all zeros for no rows", () => {
		expect(sumAssessments([])).toEqual(NO_ASSESSMENTS);
	});

	it("sums every field across rows", () => {
		const rows = [
			sums({ positive_runs: 1, neutral_runs: 2, negative_runs: 3, mixed_runs: 4, position_sum: 5, positioned_runs: 6 }),
			sums({
				positive_runs: 7,
				neutral_runs: 8,
				negative_runs: 9,
				mixed_runs: 10,
				position_sum: 11,
				positioned_runs: 12,
			}),
		];
		expect(sumAssessments(rows)).toEqual({
			positive_runs: 8,
			neutral_runs: 10,
			negative_runs: 12,
			mixed_runs: 14,
			position_sum: 16,
			positioned_runs: 18,
		});
	});

	it("leaves the empty total and the rows it was given unchanged", () => {
		const row = sums({ positive_runs: 2, position_sum: 3, positioned_runs: 1 });
		const rowBefore = { ...row };
		sumAssessments([row, row]);
		expect(row).toEqual(rowBefore);
		expect(NO_ASSESSMENTS).toEqual({
			positive_runs: 0,
			neutral_runs: 0,
			negative_runs: 0,
			mixed_runs: 0,
			position_sum: 0,
			positioned_runs: 0,
		});
	});
});

describe("sentimentSummary", () => {
	it("counts each sentiment from its own runs", () => {
		const summary = sentimentSummary(sums({ positive_runs: 1, neutral_runs: 2, mixed_runs: 3, negative_runs: 4 }));
		expect(summary).toMatchObject({ positive: 1, neutral: 2, mixed: 3, negative: 4 });
	});

	it("has no score without an answer that has a sentiment, even when the company was ranked", () => {
		expect(sentimentSummary(NO_ASSESSMENTS).score).toBeNull();
		expect(sentimentSummary(sums({ position_sum: 4, positioned_runs: 2 })).score).toBeNull();
	});

	it("scores only positive answers as 1 and only negative answers as 0", () => {
		expect(sentimentSummary(sums({ positive_runs: 3 })).score).toBe(1);
		expect(sentimentSummary(sums({ negative_runs: 3 })).score).toBe(0);
	});

	it("scores only neutral or only mixed answers as one half", () => {
		expect(sentimentSummary(sums({ neutral_runs: 3 })).score).toBe(0.5);
		expect(sentimentSummary(sums({ mixed_runs: 3 })).score).toBe(0.5);
	});

	it("counts neutral and mixed answers as half positive", () => {
		expect(sentimentSummary(sums({ positive_runs: 2, neutral_runs: 1, negative_runs: 1 })).score).toBe(0.625);
		expect(sentimentSummary(sums({ positive_runs: 1, mixed_runs: 1, negative_runs: 1 })).score).toBeCloseTo(0.5);
		expect(sentimentSummary(sums({ positive_runs: 1, neutral_runs: 1, mixed_runs: 1 })).score).toBeCloseTo(2 / 3);
	});
});

describe("mentionQuality", () => {
	it("pairs the sentiment summary with the average position", () => {
		const input = sums({ positive_runs: 2, neutral_runs: 1, negative_runs: 1, position_sum: 5, positioned_runs: 3 });
		const quality = mentionQuality(input);
		expect(quality.sentiment).toEqual(sentimentSummary(input));
		expect(quality.position.average).toBe(averagePosition(5, 3));
		expect(quality.position.average).toBe(1.7);
	});

	it("has no average position when the company was never ranked", () => {
		expect(mentionQuality(sums({ positive_runs: 4 })).position.average).toBeNull();
	});
});
