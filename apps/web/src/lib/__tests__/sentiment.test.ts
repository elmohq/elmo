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

	it.each(["unmentioned", "Positive", "", undefined, null, 1])("rejects %j", (value) => {
		expect(isSentiment(value)).toBe(false);
	});
});

describe("sentimentTotal", () => {
	it("sums the four sentiment counts", () => {
		expect(sentimentTotal({ positive: 3, neutral: 2, mixed: 1, negative: 4 })).toBe(10);
	});
});

describe("averagePosition", () => {
	it("returns null when there are no positioned runs", () => {
		expect(averagePosition(5, 0)).toBeNull();
	});

	it.each([
		[5, 3, 1.7],
		[7, 3, 2.3],
		[6, 3, 2],
	])("averages a position sum of %i across %i runs", (positionSum, runs, expected) => {
		expect(averagePosition(positionSum, runs)).toBe(expected);
	});
});

describe("sumAssessments", () => {
	it("returns all zeros for an empty list", () => {
		expect(sumAssessments([])).toEqual(NO_ASSESSMENTS);
	});

	it("sums every assessment field across rows", () => {
		expect(
			sumAssessments([
				{
					positive_runs: 1,
					neutral_runs: 2,
					negative_runs: 3,
					mixed_runs: 4,
					position_sum: 5,
					positioned_runs: 6,
				},
				{
					positive_runs: 7,
					neutral_runs: 8,
					negative_runs: 9,
					mixed_runs: 10,
					position_sum: 11,
					positioned_runs: 12,
				},
			]),
		).toEqual({
			positive_runs: 8,
			neutral_runs: 10,
			negative_runs: 12,
			mixed_runs: 14,
			position_sum: 16,
			positioned_runs: 18,
		});
	});

	it("does not modify the shared defaults or the input rows", () => {
		const rows = [sums({ positive_runs: 2, position_sum: 3 }), sums({ negative_runs: 1 })];
		const defaultsBefore = { ...NO_ASSESSMENTS };
		const rowsBefore = structuredClone(rows);

		sumAssessments(rows);

		expect(NO_ASSESSMENTS).toEqual(defaultsBefore);
		expect(rows).toEqual(rowsBefore);
	});
});

describe("sentimentSummary", () => {
	it("maps each run count to its matching sentiment", () => {
		expect(
			sentimentSummary(
				sums({
					positive_runs: 1,
					neutral_runs: 2,
					mixed_runs: 3,
					negative_runs: 4,
				}),
			),
		).toEqual({ positive: 1, neutral: 2, mixed: 3, negative: 4, score: 0.35 });
	});

	it("returns a null score when there are no sentiments, even with positioned runs", () => {
		expect(sentimentSummary(sums({ position_sum: 3, positioned_runs: 2 })).score).toBeNull();
	});

	it.each([
		["positive", { positive_runs: 2 }, 1],
		["negative", { negative_runs: 2 }, 0],
		["neutral", { neutral_runs: 2 }, 0.5],
		["mixed", { mixed_runs: 2 }, 0.5],
	])("scores only %s runs correctly", (_sentiment, overrides, expected) => {
		expect(sentimentSummary(sums(overrides)).score).toBe(expected);
	});

	it("weights positive, neutral, and negative runs correctly", () => {
		const summary = sentimentSummary(sums({ positive_runs: 2, neutral_runs: 1, negative_runs: 1 }));

		expect(summary.score).toBeCloseTo(0.625);
	});
});

describe("mentionQuality", () => {
	it("combines the sentiment summary and average position for the same input", () => {
		const assessmentSums = sums({
			positive_runs: 2,
			neutral_runs: 1,
			negative_runs: 1,
			position_sum: 5,
			positioned_runs: 3,
		});

		expect(mentionQuality(assessmentSums)).toEqual({
			sentiment: sentimentSummary(assessmentSums),
			position: { average: averagePosition(5, 3) },
		});
	});

	it("returns a null average when there are no positioned runs", () => {
		expect(mentionQuality(sums({ positive_runs: 1 })).position.average).toBeNull();
	});
});
