import { describe, expect, it } from "vitest";
import { buildLandscape } from "@/lib/landscape";

const verdicts = {
	positive_runs: 0,
	neutral_runs: 0,
	negative_runs: 0,
	mixed_runs: 0,
	position_sum: 0,
	positioned_runs: 0,
};

const day = (date: string, runs: number, brand: number, competitorMentions: number, extra = {}) => ({
	date,
	runs,
	brand_mentioned_runs: brand,
	competitor_runs: competitorMentions,
	competitor_mentions: competitorMentions,
	...verdicts,
	...extra,
});

describe("buildLandscape", () => {
	const input = {
		brand: { name: "Acme", domain: "acme.com" },
		competitors: [
			{ name: "Globex", domain: "globex.com" },
			{ name: "Initech", domain: null },
		],
		dates: ["2026-03-02", "2026-03-03"],
		brandDaily: [
			// The day before the range only feeds the trailing window.
			day("2026-03-01", 10, 10, 0),
			day("2026-03-02", 10, 4, 6, { positive_runs: 3, neutral_runs: 1, position_sum: 6, positioned_runs: 4 }),
			day("2026-03-03", 10, 6, 4),
		],
		competitorDaily: [{ date: "2026-03-02", competitor: "Globex", runs: 6, ...verdicts, negative_runs: 2 }],
		brandByModel: [
			{
				model: "chatgpt",
				runs: 20,
				brand_mentioned_runs: 10,
				competitor_runs: 10,
				competitor_mentions: 10,
				...verdicts,
			},
		],
		competitorsByModel: [{ competitor: "Globex", model: "chatgpt", runs: 10, ...verdicts }],
		windowDays: 2,
	};

	it("measures every company against the same runs and mentions", () => {
		const landscape = buildLandscape(input);
		const [acme, globex, initech] = landscape.companies;
		expect(acme.totals).toMatchObject({ visibility: 0.5, share: 0.5, sentiment: 0.75, position: 1.5 });
		expect(globex.totals).toMatchObject({ visibility: 0.3, share: 0.3, sentiment: 0 });
		// Tracked but never named: measured as zero rather than left out.
		expect(initech.totals).toMatchObject({ visibility: 0, share: 0, position: null });
	});

	it("smooths each day over the trailing window, reaching before the range", () => {
		const acme = buildLandscape(input).companies[0];
		expect(acme.series.visibility).toEqual([0.7, 0.5]);
	});

	it("measures each company per model against that model's runs", () => {
		const landscape = buildLandscape(input);
		expect(landscape.models).toEqual(["chatgpt"]);
		expect(landscape.companies[0].byModel.chatgpt).toMatchObject({ visibility: 0.5, share: 0.5 });
		expect(landscape.companies[1].byModel.chatgpt).toMatchObject({ visibility: 0.5, share: 0.5 });
	});
});
