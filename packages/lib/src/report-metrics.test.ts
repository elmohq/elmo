import { describe, it, expect } from "vitest";
import {
	computePromptSoV,
	computeOverallSoV,
	computeCompetitorSoVs,
	selectRepresentativePrompts,
	getSoVColor,
	getSoVLevel,
	type ReportPromptRun,
	type ReportCompetitor,
	type PromptSoV,
} from "./report-metrics";

const competitors: ReportCompetitor[] = [
	{ name: "CompA", domain: "compa.com" },
	{ name: "CompB", domain: "compb.com" },
];

function makeRun(overrides: Partial<ReportPromptRun> & { promptId: string }): ReportPromptRun {
	return {
		brandMentioned: false,
		competitorsMentioned: [],
		...overrides,
	};
}

describe("computePromptSoV", () => {
	it("returns null SoV when no runs exist for prompt", () => {
		const result = computePromptSoV("p1", [], competitors);
		expect(result.sov).toBeNull();
		expect(result.totalRuns).toBe(0);
	});

	it("returns null SoV when no one is mentioned", () => {
		const runs = [
			makeRun({ promptId: "p1" }),
			makeRun({ promptId: "p1" }),
		];
		const result = computePromptSoV("p1", runs, competitors);
		expect(result.sov).toBeNull();
		expect(result.totalRuns).toBe(2);
		expect(result.brandMentionCount).toBe(0);
	});

	it("returns 100% SoV when only brand is mentioned", () => {
		const runs = [
			makeRun({ promptId: "p1", brandMentioned: true }),
			makeRun({ promptId: "p1", brandMentioned: true }),
			makeRun({ promptId: "p1" }),
		];
		const result = computePromptSoV("p1", runs, competitors);
		expect(result.sov).toBe(100);
		expect(result.brandMentionCount).toBe(2);
	});

	it("returns 0% SoV when only competitors are mentioned", () => {
		const runs = [
			makeRun({ promptId: "p1", competitorsMentioned: ["CompA"] }),
			makeRun({ promptId: "p1", competitorsMentioned: ["CompB"] }),
		];
		const result = computePromptSoV("p1", runs, competitors);
		expect(result.sov).toBe(0);
		expect(result.totalCompetitorMentions).toBe(2);
	});

	it("computes correct SoV with mixed mentions", () => {
		const runs = [
			makeRun({ promptId: "p1", brandMentioned: true, competitorsMentioned: ["CompA"] }),
			makeRun({ promptId: "p1", competitorsMentioned: ["CompA", "CompB"] }),
			makeRun({ promptId: "p1", brandMentioned: true }),
		];
		// brand mentions: 2, competitor mentions: 3 (CompA twice, CompB once)
		// SoV = 2 / (2 + 3) = 40%
		const result = computePromptSoV("p1", runs, competitors);
		expect(result.sov).toBe(40);
		expect(result.brandMentionCount).toBe(2);
		expect(result.totalCompetitorMentions).toBe(3);
		expect(result.competitorMentions).toEqual({ CompA: 2, CompB: 1 });
	});

	it("ignores competitors not in the competitors list", () => {
		const runs = [
			makeRun({ promptId: "p1", brandMentioned: true, competitorsMentioned: ["Unknown"] }),
		];
		const result = computePromptSoV("p1", runs, competitors);
		expect(result.sov).toBe(100);
		expect(result.totalCompetitorMentions).toBe(0);
	});

	it("only counts runs for the specified prompt", () => {
		const runs = [
			makeRun({ promptId: "p1", brandMentioned: true }),
			makeRun({ promptId: "p2", competitorsMentioned: ["CompA"] }),
		];
		const result = computePromptSoV("p1", runs, competitors);
		expect(result.sov).toBe(100);
		expect(result.totalRuns).toBe(1);
	});
});

describe("computeOverallSoV", () => {
	it("returns null when no mentions at all", () => {
		const runs = [makeRun({ promptId: "p1" }), makeRun({ promptId: "p2" })];
		expect(computeOverallSoV(runs, competitors)).toBeNull();
	});

	it("returns null for empty runs", () => {
		expect(computeOverallSoV([], competitors)).toBeNull();
	});

	it("aggregates across all prompts", () => {
		const runs = [
			makeRun({ promptId: "p1", brandMentioned: true }),
			makeRun({ promptId: "p1", competitorsMentioned: ["CompA"] }),
			makeRun({ promptId: "p2", brandMentioned: true, competitorsMentioned: ["CompB"] }),
			makeRun({ promptId: "p2", competitorsMentioned: ["CompA"] }),
		];
		// brand: 2, competitors: 3 => SoV = 2/5 = 40%
		expect(computeOverallSoV(runs, competitors)).toBe(40);
	});

	it("returns 100% when only brand mentioned across prompts", () => {
		const runs = [
			makeRun({ promptId: "p1", brandMentioned: true }),
			makeRun({ promptId: "p2", brandMentioned: true }),
		];
		expect(computeOverallSoV(runs, competitors)).toBe(100);
	});
});

describe("computeCompetitorSoVs", () => {
	it("returns empty array when no mentions", () => {
		const runs = [makeRun({ promptId: "p1" })];
		expect(computeCompetitorSoVs(runs, competitors)).toEqual([]);
	});

	it("computes per-competitor SoV sorted by SoV descending", () => {
		const runs = [
			makeRun({ promptId: "p1", brandMentioned: true, competitorsMentioned: ["CompA"] }),
			makeRun({ promptId: "p1", competitorsMentioned: ["CompA", "CompB"] }),
			makeRun({ promptId: "p2", brandMentioned: true, competitorsMentioned: ["CompB"] }),
		];
		// Total: brand=2, CompA=2, CompB=2 => total=6
		// Brand SoV = 33%, CompA SoV = 33%, CompB SoV = 33%
		const result = computeCompetitorSoVs(runs, competitors);
		expect(result).toHaveLength(2);
		expect(result[0].sov + result[1].sov).toBeLessThanOrEqual(68); // rounding
		expect(result[0].mentionCount).toBe(2);
	});

	it("handles competitors with zero mentions", () => {
		const runs = [
			makeRun({ promptId: "p1", brandMentioned: true, competitorsMentioned: ["CompA"] }),
		];
		const result = computeCompetitorSoVs(runs, competitors);
		const compB = result.find((c) => c.name === "CompB");
		expect(compB?.sov).toBe(0);
		expect(compB?.mentionCount).toBe(0);
	});
});

describe("selectRepresentativePrompts", () => {
	const isBranded = (id: string) => id === "branded1";

	it("selects 2 strengths and 2 opportunities", () => {
		const sovs: PromptSoV[] = [
			{ promptId: "p1", sov: 80, brandMentionCount: 4, totalRuns: 5, totalCompetitorMentions: 1, competitorMentions: { CompA: 1 } },
			{ promptId: "p2", sov: 60, brandMentionCount: 3, totalRuns: 5, totalCompetitorMentions: 2, competitorMentions: { CompA: 2 } },
			{ promptId: "p3", sov: 10, brandMentionCount: 1, totalRuns: 5, totalCompetitorMentions: 9, competitorMentions: { CompA: 5, CompB: 4 } },
			{ promptId: "p4", sov: 0, brandMentionCount: 0, totalRuns: 5, totalCompetitorMentions: 4, competitorMentions: { CompA: 4 } },
		];

		const result = selectRepresentativePrompts(sovs, isBranded);
		expect(result).toHaveLength(4);

		const strengths = result.filter((r) => r.category === "strength");
		const opportunities = result.filter((r) => r.category === "opportunity");
		expect(strengths).toHaveLength(2);
		expect(opportunities).toHaveLength(2);

		// Strengths should be p1 (80%) and p2 (60%)
		expect(strengths.map((s) => s.promptId)).toEqual(["p1", "p2"]);
		// Opportunities should be p4 (0%) and p3 (10%) — lowest SoV first
		expect(opportunities.map((o) => o.promptId)).toEqual(["p4", "p3"]);
	});

	it("fills from other bucket when one has fewer than 2", () => {
		const sovs: PromptSoV[] = [
			{ promptId: "p1", sov: 80, brandMentionCount: 4, totalRuns: 5, totalCompetitorMentions: 1, competitorMentions: {} },
			{ promptId: "p2", sov: 60, brandMentionCount: 3, totalRuns: 5, totalCompetitorMentions: 2, competitorMentions: {} },
			{ promptId: "p3", sov: 50, brandMentionCount: 2, totalRuns: 5, totalCompetitorMentions: 2, competitorMentions: {} },
		];

		// No real opportunities (no prompts with competitor mentions but low brand SoV)
		const result = selectRepresentativePrompts(sovs, isBranded);
		expect(result.length).toBeGreaterThanOrEqual(3);
	});

	it("prefers non-branded prompts", () => {
		const sovs: PromptSoV[] = [
			{ promptId: "branded1", sov: 90, brandMentionCount: 4, totalRuns: 5, totalCompetitorMentions: 1, competitorMentions: {} },
			{ promptId: "p1", sov: 70, brandMentionCount: 3, totalRuns: 5, totalCompetitorMentions: 2, competitorMentions: {} },
			{ promptId: "p2", sov: 50, brandMentionCount: 2, totalRuns: 5, totalCompetitorMentions: 3, competitorMentions: {} },
			{ promptId: "p3", sov: 10, brandMentionCount: 1, totalRuns: 5, totalCompetitorMentions: 5, competitorMentions: { CompA: 5 } },
			{ promptId: "p4", sov: 0, brandMentionCount: 0, totalRuns: 5, totalCompetitorMentions: 4, competitorMentions: { CompA: 4 } },
		];

		const result = selectRepresentativePrompts(sovs, isBranded);
		// branded1 should not be selected when there are enough non-branded
		expect(result.every((r) => r.promptId !== "branded1")).toBe(true);
	});

	it("returns empty array when no prompts", () => {
		expect(selectRepresentativePrompts([], isBranded)).toEqual([]);
	});

	it("handles case where all prompts have null SoV", () => {
		const sovs: PromptSoV[] = [
			{ promptId: "p1", sov: null, brandMentionCount: 0, totalRuns: 5, totalCompetitorMentions: 0, competitorMentions: {} },
			{ promptId: "p2", sov: null, brandMentionCount: 0, totalRuns: 5, totalCompetitorMentions: 0, competitorMentions: {} },
		];
		const result = selectRepresentativePrompts(sovs, isBranded);
		expect(result).toEqual([]);
	});
});

describe("getSoVColor", () => {
	it("returns correct colors for SoV ranges", () => {
		expect(getSoVColor(null)).toBe("text-gray-400");
		expect(getSoVColor(10)).toBe("text-rose-500");
		expect(getSoVColor(30)).toBe("text-amber-500");
		expect(getSoVColor(50)).toBe("text-emerald-600");
	});
});

describe("getSoVLevel", () => {
	it("returns correct levels for SoV ranges", () => {
		expect(getSoVLevel(null).label).toBe("No Data");
		expect(getSoVLevel(10).label).toBe("Low");
		expect(getSoVLevel(30).label).toBe("Moderate");
		expect(getSoVLevel(50).label).toBe("Strong");
	});
});
