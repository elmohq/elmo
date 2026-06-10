import { describe, it, expect } from "vitest";
import {
	computeFanoutAnalysis,
	deriveGoogleFanout,
	mergeGoogleFanout,
	parseGoogleSearchQuery,
	UNAVAILABLE_SENTINEL,
	type FanoutBreakdownRow,
	type FanoutModelTotalRow,
	type FanoutPromptTotalRow,
	type GoogleFanoutDerived,
	type GoogleFanoutCitationRow,
} from "@/lib/fanout-analysis";

/** Build a `GoogleFanoutDerived` for merge tests (the `rows` are irrelevant to merging). */
function googleDerived(
	totalsByModel: Record<string, { fanoutRuns: number; totalQueries: number }>,
	totalsByPrompt: Record<string, { fanoutRuns: number; totalQueries: number }> = {},
): GoogleFanoutDerived {
	return {
		rows: [],
		totalsByModel: new Map(Object.entries(totalsByModel)),
		totalsByPrompt: new Map(Object.entries(totalsByPrompt)),
	};
}

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

	it("rejects shopping and vertical surfaces (prds / tbm / non-web udm)", () => {
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=crm&prds=epd:123")).toBeNull();
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=crm&tbm=shop")).toBeNull();
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=crm&udm=28")).toBeNull(); // shopping
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=crm&udm=2")).toBeNull(); // images
	});

	it("accepts udm=14 — Google's plain Web results surface, a genuine web search", () => {
		expect(parseGoogleSearchQuery("https://www.google.com/search?q=best+crm&udm=14")).toBe("best crm");
	});

	it("rejects non-search and non-google urls", () => {
		expect(parseGoogleSearchQuery("https://www.google.com/maps?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("https://example.com/search?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("not a url")).toBeNull();
	});

	it("requires the path to be exactly /search, not just a /search prefix", () => {
		expect(parseGoogleSearchQuery("https://www.google.com/searchbyimage?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("https://www.google.com/search/howsearchworks?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("https://www.google.com/search/?q=crm")).toBe("crm"); // trailing slash ok
	});

	it("rejects look-alike hosts where 'google' isn't the registrable domain", () => {
		expect(parseGoogleSearchQuery("https://google.evil.com/search?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("https://google.com.evil.com/search?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("https://notgoogle.com/search?q=crm")).toBeNull();
		expect(parseGoogleSearchQuery("https://mygoogle.co.uk/search?q=crm")).toBeNull();
		// genuine google hosts still parse
		expect(parseGoogleSearchQuery("https://news.google.com/search?q=crm")).toBe("crm");
		expect(parseGoogleSearchQuery("https://www.google.com.au/search?q=crm")).toBe("crm");
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

	it("counts a query cited twice by the same run once (extractors may not dedup citations)", () => {
		// DataForSEO's citation extractor has no dedup — one run citing the same
		// google.com/search link in two reference blocks must still be one query
		// instance, or a single run could satisfy the count >= 2 Invisible/Won gate.
		const citations: GoogleFanoutCitationRow[] = [
			{ prompt_id: "p1", prompt_run_id: "rA", model: "google-ai-mode", url: "https://www.google.com/search?q=best+crm", brand_mentioned: true },
			{ prompt_id: "p1", prompt_run_id: "rA", model: "google-ai-mode", url: "https://www.google.com/search?q=best+crm&hl=en", brand_mentioned: true },
			// same query from a different run still counts
			{ prompt_id: "p1", prompt_run_id: "rB", model: "google-ai-mode", url: "https://www.google.com/search?q=best+crm", brand_mentioned: false },
		];

		const { rows, totalsByModel, totalsByPrompt } = deriveGoogleFanout(citations, promptMap);
		expect(rows).toEqual([
			{ prompt_id: "p1", model: "google-ai-mode", query: "best crm", count: 2, brand_mentions: 1 },
		]);
		expect(totalsByModel.get("google-ai-mode")).toEqual({ fanoutRuns: 2, totalQueries: 2 });
		expect(totalsByPrompt.get("p1")).toEqual({ fanoutRuns: 2, totalQueries: 2 });
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

	it("breaks fan-out down per model, surfacing models that ran without fan-out as zero", () => {
		const byModel = Object.fromEntries(a.byModel.map((m) => [m.model, m]));
		expect(byModel.chatgpt.totalQueries).toBe(9);
		expect(byModel.chatgpt.avgPerExecution).toBe(1);
		// google-ai-mode ran (runs > 0) but produced no fan-out — listed with zeros.
		expect(byModel["google-ai-mode"]).toMatchObject({ totalQueries: 0, fanoutRuns: 0, avgPerExecution: 0 });
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

describe("computeFanoutAnalysis: 'unavailable' sentinel", () => {
	// Some providers (OpenRouter always; BrightData/Olostep on extraction failure)
	// store ["unavailable"] in web_queries when a search happened but the strings
	// aren't exposed. It's not a real fan-out query and must never reach the page.
	const breakdown: FanoutBreakdownRow[] = [
		{ prompt_id: "p1", model: "openrouter-claude", query: UNAVAILABLE_SENTINEL, count: 6, brand_mentions: 2 },
		{ prompt_id: "p1", model: "openrouter-gpt", query: "Unavailable", count: 3, brand_mentions: 1 }, // mixed case
		{ prompt_id: "p1", model: "chatgpt", query: "best crm software 2026", count: 4, brand_mentions: 3 },
	];
	// The SQL filters the sentinel, so OpenRouter's model totals come back at 0.
	const modelTotals: FanoutModelTotalRow[] = [
		{ model: "openrouter-claude", runs: 8, fanout_runs: 0, total_queries: 0 },
		{ model: "openrouter-gpt", runs: 5, fanout_runs: 0, total_queries: 0 },
		{ model: "chatgpt", runs: 4, fanout_runs: 4, total_queries: 4 },
	];
	const a = computeFanoutAnalysis(breakdown, modelTotals, promptMap);

	it("excludes the sentinel (any case) from every query aggregate", () => {
		expect(a.totalQueries).toBe(4); // the sentinel's 6 + 3 are dropped
		expect(a.uniqueQueries).toBe(1);
		expect(a.topQueries.map((q) => q.query)).toEqual(["best crm software 2026"]);
		expect(a.terms.some((t) => t.term === UNAVAILABLE_SENTINEL)).toBe(false);
		expect(a.invisibleQueries.some((q) => q.query === UNAVAILABLE_SENTINEL)).toBe(false);
		expect(a.byPrompt[0].variations.some((v) => v.query === UNAVAILABLE_SENTINEL)).toBe(false);
	});

	it("surfaces sentinel-only providers in the per-model breakdown with zero fan-out", () => {
		const byModel = Object.fromEntries(a.byModel.map((m) => [m.model, m]));
		expect(byModel["openrouter-claude"]).toMatchObject({ totalQueries: 0, fanoutRuns: 0 });
		expect(byModel["openrouter-gpt"]).toMatchObject({ totalQueries: 0, fanoutRuns: 0 });
		expect(byModel.chatgpt.totalQueries).toBe(4);
	});
});

describe("computeFanoutAnalysis: empty input", () => {
	it("returns zeroed totals and empty lists without NaN when nothing ran", () => {
		const a = computeFanoutAnalysis([], [], promptMap);
		expect(a.totalQueries).toBe(0);
		expect(a.uniqueQueries).toBe(0);
		expect(a.totalRuns).toBe(0);
		expect(a.fanoutRuns).toBe(0);
		expect(a.avgPerExecution).toBe(0);
		expect(a.coverageRate).toBe(0);
		expect(a.topQueries).toEqual([]);
		expect(a.terms).toEqual([]);
		expect(a.wordChanges).toEqual({ added: [], dropped: [], preserved: [] });
		expect(a.byModel).toEqual([]);
		expect(a.byPrompt).toEqual([]);
		expect(a.invisibleQueries).toEqual([]);
		expect(a.wonQueries).toEqual([]);
	});

	it("zeroes per-query aggregates when runs exist but no breakdown rows survive filtering", () => {
		const modelTotals: FanoutModelTotalRow[] = [{ model: "chatgpt", runs: 6, fanout_runs: 0, total_queries: 0 }];
		const a = computeFanoutAnalysis([], modelTotals, promptMap);
		expect(a.totalRuns).toBe(6);
		expect(a.totalQueries).toBe(0);
		expect(a.avgPerExecution).toBe(0); // no divide-by-zero
		expect(a.byModel).toEqual([
			{ model: "chatgpt", runs: 6, fanoutRuns: 0, totalQueries: 0, avgPerExecution: 0, topQueries: [] },
		]);
	});
});

describe("mergeGoogleFanout", () => {
	it("keeps a Google model's genuine web_queries fan-out when there are no citations (Olostep)", () => {
		// Regression: the old code zeroed Google's totals unconditionally, discarding
		// Olostep's real fan-out. Merge must leave it untouched.
		const modelTotals: FanoutModelTotalRow[] = [{ model: "google-ai-mode", runs: 5, fanout_runs: 4, total_queries: 12 }];
		const { modelTotals: merged, reconstructedModels } = mergeGoogleFanout(modelTotals, [], googleDerived({}));
		expect(merged[0]).toEqual({ model: "google-ai-mode", runs: 5, fanout_runs: 4, total_queries: 12 });
		expect(reconstructedModels).toEqual([]);
	});

	it("adds citation-reconstructed fan-out to the echo-zeroed web_queries totals (DataForSEO)", () => {
		const modelTotals: FanoutModelTotalRow[] = [{ model: "google-ai-mode", runs: 5, fanout_runs: 0, total_queries: 0 }];
		const { modelTotals: merged, reconstructedModels } = mergeGoogleFanout(
			modelTotals,
			[],
			googleDerived({ "google-ai-mode": { fanoutRuns: 4, totalQueries: 11 } }),
		);
		expect(merged[0]).toEqual({ model: "google-ai-mode", runs: 5, fanout_runs: 4, total_queries: 11 });
		expect(reconstructedModels).toEqual(["google-ai-mode"]);
	});

	it("adds (never replaces) when a Google model has both real web_queries and reconstructed searches", () => {
		const modelTotals: FanoutModelTotalRow[] = [{ model: "google-ai-mode", runs: 8, fanout_runs: 4, total_queries: 12 }];
		const { modelTotals: merged, reconstructedModels } = mergeGoogleFanout(
			modelTotals,
			[],
			googleDerived({ "google-ai-mode": { fanoutRuns: 3, totalQueries: 7 } }),
		);
		expect(merged[0]).toMatchObject({ runs: 8, fanout_runs: 7, total_queries: 19 });
		// Has genuine web_queries too, so it's NOT labeled purely "reconstructed".
		expect(reconstructedModels).toEqual([]);
	});

	it("labels google-ai-overview the same as google-ai-mode (echo-zeroed → reconstructed)", () => {
		const modelTotals: FanoutModelTotalRow[] = [{ model: "google-ai-overview", runs: 3, fanout_runs: 0, total_queries: 0 }];
		const { modelTotals: merged, reconstructedModels } = mergeGoogleFanout(
			modelTotals,
			[],
			googleDerived({ "google-ai-overview": { fanoutRuns: 2, totalQueries: 6 } }),
		);
		expect(merged[0]).toEqual({ model: "google-ai-overview", runs: 3, fanout_runs: 2, total_queries: 6 });
		expect(reconstructedModels).toEqual(["google-ai-overview"]);
	});

	it("appends a reconstructed Google model absent from the web_queries totals, and leaves other models untouched", () => {
		const modelTotals: FanoutModelTotalRow[] = [{ model: "chatgpt", runs: 10, fanout_runs: 9, total_queries: 20 }];
		const { modelTotals: merged } = mergeGoogleFanout(
			modelTotals,
			[],
			googleDerived({ "google-ai-mode": { fanoutRuns: 2, totalQueries: 5 } }),
		);
		expect(merged.find((m) => m.model === "chatgpt")).toEqual({ model: "chatgpt", runs: 10, fanout_runs: 9, total_queries: 20 });
		expect(merged.find((m) => m.model === "google-ai-mode")).toEqual({ model: "google-ai-mode", runs: 2, fanout_runs: 2, total_queries: 5 });
	});

	it("folds reconstructed Google runs into the per-prompt run denominators (was previously dropped)", () => {
		const promptTotals: FanoutPromptTotalRow[] = [{ prompt_id: "p1", runs: 3 }];
		const { promptRuns } = mergeGoogleFanout(
			[],
			promptTotals,
			googleDerived({}, { p1: { fanoutRuns: 2, totalQueries: 5 }, p2: { fanoutRuns: 1, totalQueries: 4 } }),
		);
		expect(promptRuns.get("p1")).toBe(5); // 3 web_queries runs + 2 reconstructed
		expect(promptRuns.get("p2")).toBe(1); // 0 + 1 reconstructed
	});

	it("keeps runs >= fanout_runs when reconstructed runs exceed web-search-enabled runs", () => {
		// Edge: a Google model whose reconstructed runs outnumber its web-search-enabled
		// `runs` must not report more "runs w/ queries" than total runs.
		const modelTotals: FanoutModelTotalRow[] = [{ model: "google-ai-mode", runs: 1, fanout_runs: 0, total_queries: 0 }];
		const { modelTotals: merged } = mergeGoogleFanout(
			modelTotals,
			[],
			googleDerived({ "google-ai-mode": { fanoutRuns: 3, totalQueries: 9 } }),
		);
		expect(merged[0]).toEqual({ model: "google-ai-mode", runs: 3, fanout_runs: 3, total_queries: 9 });
	});
});

describe("server pipeline consistency (deriveGoogleFanout → mergeGoogleFanout → computeFanoutAnalysis)", () => {
	it("keeps per-model totals equal to the breakdown sums — no echo/sentinel divergence", () => {
		// DataForSEO Google: the web_queries echo is filtered out (so the breakdown
		// holds none of it) and fan-out is reconstructed from cited searches; rB reuses
		// "crm pricing" so it's a 2-count query across two runs.
		const citations: GoogleFanoutCitationRow[] = [
			{ prompt_id: "p1", prompt_run_id: "rA", model: "google-ai-mode", url: "https://www.google.com/search?q=best+crm+for+startups", brand_mentioned: true },
			{ prompt_id: "p1", prompt_run_id: "rA", model: "google-ai-mode", url: "https://www.google.com/search?q=crm+pricing", brand_mentioned: false },
			{ prompt_id: "p1", prompt_run_id: "rB", model: "google-ai-mode", url: "https://www.google.com/search?q=crm+pricing", brand_mentioned: true },
		];
		const google = deriveGoogleFanout(citations, promptMap);

		const breakdown: FanoutBreakdownRow[] = [
			{ prompt_id: "p1", model: "chatgpt", query: "best crm software 2026", count: 4, brand_mentions: 3 },
		];
		const allBreakdown = [...breakdown, ...google.rows];
		const modelTotals: FanoutModelTotalRow[] = [
			{ model: "chatgpt", runs: 4, fanout_runs: 4, total_queries: 4 },
			{ model: "google-ai-mode", runs: 2, fanout_runs: 0, total_queries: 0 }, // echo filtered → 0
		];

		const { modelTotals: merged, promptRuns, reconstructedModels } = mergeGoogleFanout(
			modelTotals,
			[{ prompt_id: "p1", runs: 4 }],
			google,
		);
		const a = computeFanoutAnalysis(allBreakdown, merged, promptMap, { promptRuns });

		// Each model's reported totalQueries equals the sum of its breakdown rows.
		const googleBreakdownSum = allBreakdown.filter((r) => r.model === "google-ai-mode").reduce((s, r) => s + r.count, 0);
		expect(a.byModel.find((m) => m.model === "google-ai-mode")!.totalQueries).toBe(googleBreakdownSum); // 3
		// Headline total == sum of breakdown == sum of per-model totals (no divergence).
		const breakdownTotal = allBreakdown.reduce((s, r) => s + r.count, 0);
		expect(a.totalQueries).toBe(breakdownTotal); // 4 + 3 = 7
		expect(a.byModel.reduce((s, m) => s + m.totalQueries, 0)).toBe(a.totalQueries);

		expect(reconstructedModels).toEqual(["google-ai-mode"]);
		// Per-prompt denominator folds in the 2 reconstructed Google runs.
		expect(promptRuns.get("p1")).toBe(6); // 4 + 2
	});
});
