import { describe, it, expect } from "vitest";
import {
	computeFanoutAnalysis,
	deriveGoogleFanout,
	parseGoogleSearchQuery,
	type FanoutBreakdownRow,
	type FanoutModelTotalRow,
	type GoogleFanoutCitationRow,
} from "@/lib/fanout-analysis";

const promptMap = new Map<string, string>([
	["p1", "crm software for startups"],
	["p2", "project management tool"],
]);

describe("parseGoogleSearchQuery", () => {
	it("extracts and decodes the q param from a plain search link", () => {
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=best+crm+software+2026")).toBe(
			"best crm software 2026",
		);
		expect(parseGoogleSearchQuery("https://google.co.uk/search?hl=en&q=hubspot%20review")).toBe("hubspot review");
	});

	it("rejects shopping and vertical surfaces (prds / tbm / udm)", () => {
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=crm&prds=epd:123")).toBeNull();
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=crm&tbm=shop")).toBeNull();
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=crm&udm=28")).toBeNull();
	});

	it("rejects non-search and non-google urls", () => {
		expect(parseGoogleSearchQuery("https://www.google.com/maps?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("https://example.com/search?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("not a url")).toBeNull();
	});
});

describe("deriveGoogleFanout", () => {
	it("groups citations into breakdown rows and per-model run totals, dropping echoes", () => {
		const citations: GoogleFanoutCitationRow[] = [
			// run A: two genuine fan-out searches, brand mentioned
			{ prompt_id: "p1", prompt_run_id: "rA", model: "google-ai-mode", url: "https://www.google.com/search?q=best+crm+for+startups", brand_mentioned: true },
			{ prompt_id: "p1", prompt_run_id: "rA", model: "google-ai-mode", url: "https://www.google.com/search?q=crm+pricing", brand_mentioned: true },
			// run B: same first query again, brand not mentioned
			{ prompt_id: "p1", prompt_run_id: "rB", model: "google-ai-mode", url: "https://www.google.com/search?q=best+crm+for+startups", brand_mentioned: false },
			// prompt echo — must be ignored
			{ prompt_id: "p1", prompt_run_id: "rA", model: "google-ai-mode", url: "https://www.google.com/search?q=crm+software+for+startups", brand_mentioned: true },
			// shopping — must be ignored
			{ prompt_id: "p1", prompt_run_id: "rA", model: "google-ai-mode", url: "https://www.google.com/search?q=crm&prds=epd:1", brand_mentioned: true },
		];

		const { rows, totalsByModel, totalsByPrompt } = deriveGoogleFanout(citations, promptMap);
		const best = rows.find((r) => r.query === "best crm for startups")!;
		expect(best.count).toBe(2);
		expect(best.brand_mentions).toBe(1);
		expect(rows.find((r) => r.query === "crm pricing")!.count).toBe(1);
		expect(rows.some((r) => r.query === "crm software for startups")).toBe(false); // echo dropped

		expect(totalsByModel.get("google-ai-mode")).toEqual({ fanoutRuns: 2, totalQueries: 3 });
		expect(totalsByPrompt.get("p1")).toEqual({ fanoutRuns: 2, totalQueries: 3 });
	});
});

describe("computeFanoutAnalysis", () => {
	const breakdown: FanoutBreakdownRow[] = [
		{ prompt_id: "p1", model: "chatgpt", query: "best crm software 2026", count: 4, brand_mentions: 3 },
		{ prompt_id: "p1", model: "chatgpt", query: "crm reviews", count: 2, brand_mentions: 0 },
		{ prompt_id: "p1", model: "perplexity", query: "best crm software 2026", count: 1, brand_mentions: 1 },
		{ prompt_id: "p2", model: "chatgpt", query: "top project management tool 2026", count: 3, brand_mentions: 0 },
	];
	const modelTotals: FanoutModelTotalRow[] = [
		{ model: "chatgpt", runs: 10, fanout_runs: 9, total_queries: 9 },
		{ model: "perplexity", runs: 4, fanout_runs: 1, total_queries: 1 },
		{ model: "google-ai-mode", runs: 5, fanout_runs: 0, total_queries: 0 },
	];

	const a = computeFanoutAnalysis(breakdown, modelTotals, promptMap);

	it("computes top queries with brand-mention rate", () => {
		const top = a.topQueries[0];
		expect(top.query).toBe("best crm software 2026");
		expect(top.count).toBe(5);
		expect(top.brandMentionRate).toBe(80); // 4 of 5
	});

	it("computes overall totals and coverage", () => {
		expect(a.totalQueries).toBe(10);
		expect(a.uniqueQueries).toBe(3);
		expect(a.coverageRate).toBe(40); // 4 brand mentions / 10 instances
		expect(a.totalRuns).toBe(19);
		expect(a.fanoutRuns).toBe(10);
		expect(a.avgPerExecution).toBe(1); // 10 / 10
	});

	it("classifies words engines add, drop, and preserve vs the prompt", () => {
		const added = Object.fromEntries(a.wordChanges.added.map((w) => [w.word, w.count]));
		expect(added.best).toBe(5);
		expect(added["2026"]).toBe(8); // both 2026 queries (5 + 3)
		expect(added.top).toBe(3);
		// prompt words aren't "added"
		expect(added.crm).toBeUndefined();
		expect(added.software).toBeUndefined();

		// "crm" is in p1's prompt and kept in all three p1 queries (4 + 2 + 1)
		const preserved = Object.fromEntries(a.wordChanges.preserved.map((w) => [w.word, w.count]));
		expect(preserved.crm).toBe(7);

		// p1 prompt is "crm software for startups"; "startups" is dropped from all three p1 queries
		const dropped = Object.fromEntries(a.wordChanges.dropped.map((w) => [w.word, w.count]));
		expect(dropped.startups).toBe(7);
	});

	it("breaks fan-out down per model and flags models with no fan-out", () => {
		const byModel = Object.fromEntries(a.byModel.map((m) => [m.model, m]));
		expect(byModel.chatgpt.totalQueries).toBe(9);
		expect(byModel.chatgpt.avgPerExecution).toBe(1);
		expect(a.modelsWithoutFanout).toEqual(["google-ai-mode"]);
	});

	it("splits queries into opportunities (invisible) and wins", () => {
		expect(a.invisibleQueries.map((q) => q.query)).toContain("crm reviews");
		expect(a.invisibleQueries.map((q) => q.query)).toContain("top project management tool 2026");
		expect(a.wonQueries[0].query).toBe("best crm software 2026");
	});

	it("rolls up per-prompt fan-out volume and avg queries per prompt run", () => {
		const promptRuns = new Map([["p1", 5]]);
		const withRuns = computeFanoutAnalysis(breakdown, modelTotals, promptMap, { promptRuns });
		const p1 = withRuns.byPrompt.find((p) => p.promptId === "p1")!;
		expect(p1.totalQueries).toBe(7);
		expect(p1.uniqueQueries).toBe(2);
		expect(p1.runs).toBe(5);
		expect(p1.avgPerExecution).toBe(1.4); // 7 / 5
	});

	it("limits 'won' queries to those the brand appears in more than half the time", () => {
		// "best crm software 2026" => 4/5 = 80% (> 50, won); "crm reviews" => 0% (invisible).
		expect(a.wonQueries.map((q) => q.query)).toEqual(["best crm software 2026"]);
	});
});
