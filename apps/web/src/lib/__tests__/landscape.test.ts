import { describe, expect, it } from "vitest";
import { brandRank, buildLandscape, chartedCompanies } from "@/lib/landscape";
import { NO_ASSESSMENTS } from "@/lib/sentiment";

const run = (
	prompt: string,
	model: string,
	date: string,
	runs: number,
	brand: number,
	competitorMentions: number,
	sums = {},
) => ({
	prompt_id: prompt,
	model,
	date,
	runs,
	brand_mentioned_runs: brand,
	competitor_runs: competitorMentions,
	competitor_mentions: competitorMentions,
	...NO_ASSESSMENTS,
	...sums,
});

const competitorRun = (prompt: string, model: string, date: string, runs: number, sums = {}) => ({
	prompt_id: prompt,
	model,
	date,
	competitor: "Globex",
	runs,
	...NO_ASSESSMENTS,
	...sums,
});

const input = {
	brand: { name: "Acme", domain: "acme.com" },
	competitors: [
		{ name: "Globex", domain: "globex.com" },
		{ name: "Initech", domain: null },
	],
	dates: ["2026-03-01", "2026-03-02", "2026-03-03"],
	runs: [
		run("p1", "chatgpt", "2026-03-01", 10, 5, 4, {
			positive_runs: 4,
			neutral_runs: 1,
			position_sum: 5,
			positioned_runs: 5,
		}),
		run("p2", "claude", "2026-03-02", 10, 10, 0, { positive_runs: 5, negative_runs: 5 }),
		// p1 runs again on the last day and no longer names anyone.
		run("p1", "chatgpt", "2026-03-03", 10, 0, 0),
	],
	competitorRuns: [
		competitorRun("p1", "chatgpt", "2026-03-01", 4, { negative_runs: 4, position_sum: 4, positioned_runs: 4 }),
	],
};

describe("buildLandscape", () => {
	it("carries each prompt's latest result over the days it didn't run, as the visibility page does", () => {
		const [acme] = buildLandscape(input).companies;
		// p2 hasn't run on the first day, so its first result stands in for it.
		expect(acme.series.visibility).toEqual([0.75, 0.75, 0.5]);
	});

	it("reports the last day as the current figure, for every measure", () => {
		const [acme, globex, initech] = buildLandscape(input).companies;
		expect(acme.totals).toEqual({ visibility: 0.5, share: 1, sentiment: 0.5, position: null });
		expect(acme.sentiments).toEqual({ positive: 5, neutral: 0, mixed: 0, negative: 5 });
		// Named on the first day only; p1's latest answer no longer names it.
		expect(globex.series.visibility).toEqual([0.2, 0.2, 0]);
		expect(globex.totals.share).toBe(0);
		// Tracked but never named: measured as zero rather than left out.
		expect(initech.totals).toMatchObject({ visibility: 0, share: 0, position: null });
	});

	it("measures each company per model against that model's own runs", () => {
		const landscape = buildLandscape(input);
		expect(landscape.models).toEqual(["chatgpt", "claude"]);
		expect(landscape.companies[0].byModel).toMatchObject({ chatgpt: { visibility: 0 }, claude: { visibility: 1 } });
	});

	it("scores neutral answers as neutral rather than against the brand", () => {
		const scored = (sums: object) =>
			buildLandscape({
				...input,
				runs: [run("p1", "chatgpt", "2026-03-03", 20, 20, 0, sums)],
				competitorRuns: [],
			}).companies[0].totals.sentiment;
		expect(scored({ neutral_runs: 20 })).toBe(0.5);
		expect(scored({ positive_runs: 2, neutral_runs: 17, negative_runs: 1 })).toBeCloseTo(0.525);
		expect(scored({ positive_runs: 1, mixed_runs: 19 })).toBeCloseTo(0.525);
		expect(scored({ neutral_runs: 18, negative_runs: 2 })).toBeCloseTo(0.45);
	});

	it("charts the brand beside its strongest competitors, and ranks it among all of them", () => {
		const landscape = buildLandscape(input);
		expect(chartedCompanies(landscape, "visibility", 1).map((c) => c.name)).toEqual(["Acme", "Globex"]);
		expect(brandRank(landscape, "visibility")).toBe(1);
	});
});
