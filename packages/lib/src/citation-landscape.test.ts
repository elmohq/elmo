import { describe, expect, it } from "vitest";
import {
	computeDrQuadrants,
	computeDrVolatility,
	computeKingmakers,
	computePromptDomainDistribution,
	computeScoreboard,
	computeWinnability,
	type DrVolatilityInput,
	hhi,
	type LandscapeDomain,
	pickCandidateCompetitors,
	summarizeDrBySourceType,
} from "./citation-landscape";

describe("hhi", () => {
	it("is 1 when one domain owns everything and low when diffuse", () => {
		expect(hhi([10])).toBe(1);
		expect(hhi([])).toBe(0);
		expect(hhi([1, 1, 1, 1])).toBeCloseTo(0.25, 5);
		expect(hhi([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toBeCloseTo(0.1, 5);
	});
});

describe("computeDrQuadrants", () => {
	const domains: LandscapeDomain[] = [
		{ domain: "hi-cite-lo-dr.com", count: 100, rating: 10, kind: "third_party" }, // quick win
		{ domain: "hi-cite-hi-dr.com", count: 90, rating: 90, kind: "third_party" }, // strategic
		{ domain: "lo-cite-hi-dr.com", count: 2, rating: 80, kind: "third_party" }, // under-cited
		{ domain: "lo-cite-lo-dr.com", count: 1, rating: 5, kind: "third_party" }, // niche
	];

	it("classifies into all four quadrants using medians", () => {
		const q = computeDrQuadrants(domains);
		expect(q.thresholds).not.toBeNull();
		expect(q.quickWins.map((d) => d.domain)).toContain("hi-cite-lo-dr.com");
		expect(q.strategic.map((d) => d.domain)).toContain("hi-cite-hi-dr.com");
		expect(q.underCited.map((d) => d.domain)).toContain("lo-cite-hi-dr.com");
		expect(q.nicheLow.map((d) => d.domain)).toContain("lo-cite-lo-dr.com");
		expect(q.counts).toEqual({ quickWins: 1, strategic: 1, underCited: 1, nicheLow: 1 });
	});

	it("returns empty thresholds when too few rated domains", () => {
		expect(computeDrQuadrants([{ domain: "a.com", count: 1, rating: 10, kind: "third_party" }]).thresholds).toBeNull();
	});
});

describe("computeKingmakers", () => {
	it("ranks third-party domains by prompt reach and tracks brand-absent reach", () => {
		const result = computeKingmakers({
			edges: [
				{ promptId: "p1", domain: "kingmaker.com", count: 3 },
				{ promptId: "p2", domain: "kingmaker.com", count: 1 },
				{ promptId: "p3", domain: "kingmaker.com", count: 1 },
				{ promptId: "p1", domain: "acme.com", count: 1 }, // own — excluded
				{ promptId: "p2", domain: "niche.com", count: 1 },
			],
			kindOf: { "kingmaker.com": "third_party", "acme.com": "own", "niche.com": "third_party" },
			brandCitedPromptIds: ["p1"], // brand cited only in p1
			ratings: { "kingmaker.com": 74 },
		});
		const km = result[0];
		expect(km.domain).toBe("kingmaker.com");
		expect(km.reach).toBe(3);
		expect(km.totalCitations).toBe(5);
		expect(km.rating).toBe(74);
		expect(km.brandAbsentReach).toBe(2); // p2, p3
		expect(result.find((r) => r.domain === "acme.com")).toBeUndefined();
	});
});

describe("computeWinnability", () => {
	it("ranks diffuse, run-volatile, brand-absent prompts above concentrated, brand-present ones", () => {
		const result = computeWinnability({
			runStats: [
				// diffuse prompt, brand absent — each domain present in 1 of 4 runs (unstable)
				{ promptId: "diffuse", domain: "a.com", total: 1, runsPresent: 1 },
				{ promptId: "diffuse", domain: "b.com", total: 1, runsPresent: 1 },
				{ promptId: "diffuse", domain: "c.com", total: 1, runsPresent: 1 },
				{ promptId: "diffuse", domain: "d.com", total: 1, runsPresent: 1 },
				// concentrated prompt, brand present — domain present in every run (stable)
				{ promptId: "locked", domain: "x.com", total: 10, runsPresent: 10 },
			],
			runsByPrompt: { diffuse: 4, locked: 10 },
			brandCitedPromptIds: ["locked"],
			prompts: [
				{ id: "diffuse", value: "diffuse prompt" },
				{ id: "locked", value: "locked prompt" },
			],
		});
		expect(result[0].promptId).toBe("diffuse");
		expect(result[0].concentration).toBeCloseTo(0.25, 5);
		expect(result[0].volatility).toBeGreaterThan(0);
		const locked = result.find((r) => r.promptId === "locked");
		expect(locked?.concentration).toBe(1);
		expect(locked?.volatility).toBe(0); // present in every run
		expect(locked?.brandCited).toBe(true);
	});

	it("skips prompts with no citations", () => {
		const result = computeWinnability({
			runStats: [{ promptId: "p1", domain: "a.com", total: 1, runsPresent: 1 }],
			runsByPrompt: { p1: 1 },
			brandCitedPromptIds: [],
			prompts: [
				{ id: "p1", value: "has citations" },
				{ id: "p2", value: "no citations" },
			],
		});
		expect(result.map((r) => r.promptId)).toEqual(["p1"]);
	});
});

describe("computeDrVolatility", () => {
	const input: DrVolatilityInput = {
		runStats: [
			// steady.com: 2 in each of p1's 4 runs -> CV 0
			{ promptId: "p1", domain: "steady.com", total: 8, sumsq: 16, runsPresent: 4 },
			// mid.com: present in 2 of 4 runs (counts 4,2)
			{ promptId: "p1", domain: "mid.com", total: 6, sumsq: 20, runsPresent: 2 },
			// spiky.com: spread across two prompts, present in 1 run each (counts 5 and 1)
			{ promptId: "p1", domain: "spiky.com", total: 5, sumsq: 25, runsPresent: 1 },
			{ promptId: "p2", domain: "spiky.com", total: 1, sumsq: 1, runsPresent: 1 },
			// once.com: only 1 run present -> excluded (need >= 2)
			{ promptId: "p1", domain: "once.com", total: 5, sumsq: 25, runsPresent: 1 },
			// rare.com: total below min -> excluded
			{ promptId: "p1", domain: "rare.com", total: 1, sumsq: 1, runsPresent: 1 },
		],
		runsByPrompt: { p1: 4, p2: 4 },
		ratings: { "steady.com": 90, "mid.com": 60, "spiky.com": 20, "once.com": 50, "rare.com": 50 },
		kindOf: { "steady.com": "third_party", "mid.com": "third_party", "spiky.com": "third_party" },
	};

	it("correlates DR with per-run volatility and ranks steadiest/spikiest", () => {
		const r = computeDrVolatility(input);
		expect(r.n).toBe(3);
		// higher DR -> steadier (lower CV) => strong negative correlation
		expect(r.spearman).toBeCloseTo(-1, 5);
		expect(r.mostStable[0].domain).toBe("steady.com");
		expect(r.mostStable[0].volatility).toBeCloseTo(0, 5);
		expect(r.mostVolatile[0].domain).toBe("spiky.com");
		const spiky = r.points.find((p) => p.domain === "spiky.com");
		expect(spiky?.universeRuns).toBe(8); // 4 runs each from p1 and p2
		expect(spiky?.presenceRate).toBeCloseTo(2 / 8, 5);
	});

	it("ignores unrated, sub-min-citation, and single-run domains", () => {
		const r = computeDrVolatility(input);
		expect(r.points.find((p) => p.domain === "rare.com")).toBeUndefined();
		expect(r.points.find((p) => p.domain === "once.com")).toBeUndefined();
	});

	it("returns empty when there are no qualifying domains", () => {
		const r = computeDrVolatility({ ...input, runStats: [] });
		expect(r).toMatchObject({ n: 0, spearman: null });
	});

	it("surfaces steady, low-DR domains as emulate/pay targets", () => {
		const r = computeDrVolatility({
			runStats: [
				{ promptId: "p1", domain: "steadylow.com", total: 8, sumsq: 16, runsPresent: 4 }, // vol 0, DR 10
				{ promptId: "p1", domain: "steadyhigh.com", total: 8, sumsq: 16, runsPresent: 4 }, // vol 0, DR 90
				{ promptId: "p1", domain: "spikylow.com", total: 4, sumsq: 10, runsPresent: 2 }, // higher vol, DR 10
			],
			runsByPrompt: { p1: 4 },
			ratings: { "steadylow.com": 10, "steadyhigh.com": 90, "spikylow.com": 10 },
			kindOf: {},
		});
		const names = r.steadyLowDr.map((d) => d.domain);
		expect(names).toContain("steadylow.com");
		expect(names).not.toContain("steadyhigh.com"); // high DR excluded
		expect(names).not.toContain("spikylow.com"); // not steady
	});
});

describe("pickCandidateCompetitors", () => {
	it("returns top brand-like (other source-type) third-party domains", () => {
		const out = pickCandidateCompetitors([
			{ domain: "brandx.com", citations: 50, kind: "third_party", sourceType: "other" },
			{ domain: "g2.com", citations: 40, kind: "third_party", sourceType: "review" }, // not "other"
			{ domain: "me.com", citations: 99, kind: "own", sourceType: "other" }, // own excluded
			{ domain: "small.com", citations: 5, kind: "third_party", sourceType: "other" },
		]);
		expect(out.map((d) => d.domain)).toEqual(["brandx.com", "small.com"]);
	});
});

describe("summarizeDrBySourceType", () => {
	it("buckets DR by source type and computes per-type median + histogram", () => {
		const out = summarizeDrBySourceType([
			// two comparison/best-of domains, low DR
			{ domain: "best1.com", url: "https://best1.com/best-mocktails", count: 10, rating: 12 },
			{ domain: "best2.com", url: "https://best2.com/top-10-na-drinks", count: 6, rating: 28 },
			// a review platform, high DR
			{ domain: "g2.com", url: "https://g2.com/x", count: 4, rating: 89 },
			// unrated — ignored
			{ domain: "unknown.com", url: "https://unknown.com/best-x", count: 5, rating: null },
		]);
		const comparison = out.find((s) => s.type === "comparison");
		expect(comparison?.domains).toBe(2);
		expect(comparison?.citations).toBe(16);
		expect(comparison?.medianDr).toBeCloseTo(20, 5); // median of [12, 28]
		expect(comparison?.histogram[1]).toBe(1); // 12 -> [10,20)
		expect(comparison?.histogram[2]).toBe(1); // 28 -> [20,30)
		expect(out.find((s) => s.type === "review")?.medianDr).toBe(89);
		// sorted by citations desc
		expect(out[0].type).toBe("comparison");
	});
});

describe("computePromptDomainDistribution", () => {
	it("groups domains per prompt with DR, pages and kind, sorted by citations", () => {
		const out = computePromptDomainDistribution({
			rows: [
				{ promptId: "p1", domain: "a.com", citations: 10, pages: 3 },
				{ promptId: "p1", domain: "b.com", citations: 4, pages: 1 },
				{ promptId: "p2", domain: "c.com", citations: 2, pages: 1 },
			],
			promptValues: { p1: "prompt one", p2: "prompt two" },
			ratings: { "a.com": 80, "b.com": null, "c.com": 30 },
			kindOf: { "a.com": "own", "b.com": "third_party", "c.com": "competitor" },
		});
		expect(out[0].promptId).toBe("p1"); // higher total citations
		expect(out[0].totalCitations).toBe(14);
		expect(out[0].ratedDomains).toBe(1); // only a.com has a rating
		expect(out[0].dots[0]).toMatchObject({ domain: "a.com", pages: 3, rating: 80, kind: "own" });
		expect(out[0].dots[1].rating).toBeNull();
	});

	it("computes per-prompt DR↔citation correlation when enough rated domains", () => {
		const out = computePromptDomainDistribution({
			rows: [
				{ promptId: "auth", domain: "d1.com", citations: 1, pages: 1 },
				{ promptId: "auth", domain: "d2.com", citations: 2, pages: 1 },
				{ promptId: "auth", domain: "d3.com", citations: 3, pages: 1 },
				{ promptId: "auth", domain: "d4.com", citations: 4, pages: 1 },
				{ promptId: "auth", domain: "d5.com", citations: 5, pages: 1 },
				{ promptId: "small", domain: "x.com", citations: 9, pages: 1 },
			],
			promptValues: {},
			ratings: { "d1.com": 10, "d2.com": 20, "d3.com": 30, "d4.com": 40, "d5.com": 50, "x.com": 90 },
			kindOf: {},
		});
		expect(out.find((p) => p.promptId === "auth")?.drSpearman).toBeCloseTo(1, 5); // DR rises with citations
		expect(out.find((p) => p.promptId === "small")?.drSpearman).toBeNull(); // only 1 rated domain
	});

	it("caps prompts and domains per prompt", () => {
		const out = computePromptDomainDistribution(
			{
				rows: [
					{ promptId: "p1", domain: "a.com", citations: 3, pages: 1 },
					{ promptId: "p1", domain: "b.com", citations: 2, pages: 1 },
					{ promptId: "p2", domain: "c.com", citations: 1, pages: 1 },
				],
				promptValues: {},
				ratings: {},
				kindOf: {},
			},
			{ maxPrompts: 1, maxDomainsPerPrompt: 1 },
		);
		expect(out).toHaveLength(1);
		expect(out[0].dots).toHaveLength(1);
	});
});

describe("computeScoreboard", () => {
	it("computes brand vs competitor shares overall and per model", () => {
		const sb = computeScoreboard({
			edges: [
				{ model: "chatgpt", domain: "acme.com", count: 2 },
				{ model: "chatgpt", domain: "rival.com", count: 6 },
				{ model: "perplexity", domain: "acme.com", count: 1 },
				{ model: "perplexity", domain: "other.com", count: 1 },
			],
			brandDomains: ["acme.com"],
			competitors: [{ name: "Rival", domains: ["rival.com"] }],
		});
		expect(sb.overall.total).toBe(10);
		const you = sb.overall.entities.find((e) => e.kind === "brand");
		expect(you?.citations).toBe(3);
		expect(you?.share).toBeCloseTo(0.3, 5);
		const rival = sb.overall.entities.find((e) => e.name === "Rival");
		expect(rival?.citations).toBe(6);
		expect(sb.byModel.map((m) => m.model)).toEqual(["chatgpt", "perplexity"]);
		const cg = sb.byModel.find((m) => m.model === "chatgpt");
		expect(cg?.entities.find((e) => e.name === "Rival")?.share).toBeCloseTo(0.75, 5);
	});
});
