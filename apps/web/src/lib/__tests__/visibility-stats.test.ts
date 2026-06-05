import { describe, it, expect } from "vitest";
import {
	computeVolatility,
	computeConcentration,
	computePoolStats,
	citationCoverage,
	groundingFrequency,
	isCitationOpportunity,
	stabilityScore,
	computeShareOfVoice,
	computeOpportunity,
	shareOfVoiceTimeSeriesLVCF,
	type DailyDomainCount,
} from "@/lib/visibility-stats";

/** Helper: build daily rows from a {date: {domain: count}} spec. */
function rows(spec: Record<string, Record<string, number>>): DailyDomainCount[] {
	const out: DailyDomainCount[] = [];
	for (const [date, domains] of Object.entries(spec)) {
		for (const [domain, count] of Object.entries(domains)) {
			out.push({ date, domain, count });
		}
	}
	return out;
}

describe("computeVolatility", () => {
	it("returns nulls with zero transitions when there are fewer than two days", () => {
		expect(computeVolatility([])).toEqual({ setVolatility: null, weightedVolatility: null, dayTransitions: 0 });
		expect(computeVolatility(rows({ "2026-01-01": { a: 1, b: 1 } }))).toEqual({
			setVolatility: null,
			weightedVolatility: null,
			dayTransitions: 0,
		});
	});

	it("is zero for an identical domain set every day", () => {
		const r = computeVolatility(rows({ "2026-01-01": { a: 1, b: 1 }, "2026-01-02": { a: 1, b: 1 } }));
		expect(r.setVolatility).toBe(0);
		expect(r.weightedVolatility).toBe(0);
		expect(r.dayTransitions).toBe(1);
	});

	it("is one for completely disjoint sets each day", () => {
		const r = computeVolatility(rows({ "2026-01-01": { a: 1 }, "2026-01-02": { b: 1 } }));
		expect(r.setVolatility).toBe(1);
		expect(r.weightedVolatility).toBe(1);
	});

	it("matches hand-computed Jaccard and Bray–Curtis on a mixed example", () => {
		// day1 {a,b,c} -> day2 {b,c,d}: inter=2, union=4 -> setDist 0.5
		// shares all 1/3; overlap = min(b)+min(c) = 1/3+1/3 -> weightedDist 1/3
		const r = computeVolatility(rows({ "2026-01-01": { a: 1, b: 1, c: 1 }, "2026-01-02": { b: 1, c: 1, d: 1 } }));
		expect(r.setVolatility).toBe(0.5);
		expect(r.weightedVolatility).toBeCloseTo(0.333, 3);
	});

	it("captures the orthogonality of set churn vs volume churn (pinned head, noisy tail)", () => {
		// A dominant 'hub' every day (80% of volume) with a fully-rotating tail.
		// Set churn is high (most distinct domains change) but volume churn is low
		// (the source that carries the answer is stable).
		const r = computeVolatility(
			rows({ "2026-01-01": { hub: 8, x: 1, y: 1 }, "2026-01-02": { hub: 8, z: 1, w: 1 } }),
		);
		expect(r.setVolatility).toBe(0.8); // inter {hub}=1, union 5 -> 1 - 1/5
		expect(r.weightedVolatility).toBeCloseTo(0.2, 5); // overlap = min(hub .8,.8) = .8
	});

	it("averages across multiple transitions and sums duplicate same-day rows", () => {
		const r = computeVolatility(
			rows({
				"2026-01-01": { a: 1, b: 1 }, // -> day2 identical: setDist 0
				"2026-01-02": { a: 1, b: 1 }, // -> day3 disjoint: setDist 1
				"2026-01-03": { c: 1, d: 1 },
			}),
		);
		expect(r.dayTransitions).toBe(2);
		expect(r.setVolatility).toBe(0.5); // (0 + 1) / 2
	});

	it("ignores non-positive counts", () => {
		const r = computeVolatility(rows({ "2026-01-01": { a: 1, ghost: 0 }, "2026-01-02": { a: 1 } }));
		expect(r.setVolatility).toBe(0); // 'ghost' dropped, both days = {a}
	});
});

describe("computeConcentration", () => {
	it("returns empty stats for no data", () => {
		expect(computeConcentration([])).toEqual({ coreDomains: 0, totalDomains: 0, coreShareOfCitations: null });
	});

	it("identifies a stable core and its share of volume", () => {
		// 'hub' present all 4 days (core), four tail domains present 1 day each (not core).
		const r = computeConcentration(
			rows({
				"2026-01-01": { hub: 8, a: 1 },
				"2026-01-02": { hub: 8, b: 1 },
				"2026-01-03": { hub: 8, c: 1 },
				"2026-01-04": { hub: 8, d: 1 },
			}),
		);
		expect(r.coreDomains).toBe(1);
		expect(r.totalDomains).toBe(5);
		expect(r.coreShareOfCitations).toBeCloseTo(0.889, 3); // 32 / 36
	});

	it("respects a custom core threshold", () => {
		// 'a' present 2/4 days = 0.5. Default 0.8 excludes it; threshold 0.5 includes it.
		const spec = {
			"2026-01-01": { a: 1, x: 1 },
			"2026-01-02": { a: 1, y: 1 },
			"2026-01-03": { z: 1 },
			"2026-01-04": { w: 1 },
		};
		expect(computeConcentration(rows(spec)).coreDomains).toBe(0);
		expect(computeConcentration(rows(spec), 0.5).coreDomains).toBe(1);
	});
});

describe("computePoolStats", () => {
	it("returns empty stats for no data", () => {
		expect(computePoolStats([])).toEqual({
			avgDomainsPerDay: null,
			totalDistinctDomains: 0,
			poolToSampleRatio: null,
		});
	});

	it("computes average daily breadth, distinct total, and the ratio", () => {
		const r = computePoolStats(rows({ "2026-01-01": { hub: 1, x: 1, y: 1 }, "2026-01-02": { hub: 1, z: 1, w: 1 } }));
		expect(r.avgDomainsPerDay).toBe(3);
		expect(r.totalDistinctDomains).toBe(5);
		expect(r.poolToSampleRatio).toBe(1.7); // 5 / 3 rounded
	});
});

describe("citationCoverage / groundingFrequency", () => {
	it("is null when the model never ran", () => {
		expect(citationCoverage(0, 0)).toBeNull();
	});

	it("computes cited-days / run-days and clamps cited <= run", () => {
		expect(citationCoverage(42, 21)).toBe(0.5);
		expect(citationCoverage(10, 12)).toBe(1); // clamped
	});

	it("buckets coverage into five grounding frequencies", () => {
		expect(groundingFrequency(null)).toBe("never");
		expect(groundingFrequency(0)).toBe("never");
		expect(groundingFrequency(0.1)).toBe("rarely");
		expect(groundingFrequency(0.3)).toBe("sometimes"); // boundary
		expect(groundingFrequency(0.5)).toBe("sometimes");
		expect(groundingFrequency(0.6)).toBe("usually"); // boundary
		expect(groundingFrequency(0.9)).toBe("always"); // boundary
		expect(groundingFrequency(1)).toBe("always");
	});

	it("treats >= sometimes as a citation opportunity", () => {
		expect(isCitationOpportunity(null)).toBe(false);
		expect(isCitationOpportunity(0.2)).toBe(false); // rarely
		expect(isCitationOpportunity(0.3)).toBe(true); // sometimes
		expect(isCitationOpportunity(0.95)).toBe(true);
	});
});

describe("stabilityScore", () => {
	it("inverts weighted volatility onto a 0-100 scale", () => {
		expect(stabilityScore(0)).toBe(100);
		expect(stabilityScore(1)).toBe(0);
		expect(stabilityScore(0.2)).toBe(80);
		expect(stabilityScore(null)).toBeNull();
	});
});

describe("computeShareOfVoice", () => {
	it("computes shares that sum to 1 and sorts by mentions desc", () => {
		const { entries, brandShare, total } = computeShareOfVoice({ name: "Nike", mentions: 10 }, [
			{ name: "Adidas", mentions: 8 },
			{ name: "Puma", mentions: 2 },
		]);
		expect(total).toBe(20);
		expect(brandShare).toBe(0.5);
		expect(entries.map((e) => e.name)).toEqual(["Nike", "Adidas", "Puma"]);
		expect(entries.find((e) => e.isBrand)?.share).toBe(0.5);
		expect(entries.reduce((s, e) => s + e.share, 0)).toBeCloseTo(1, 5);
	});

	it("handles the no-data case without dividing by zero", () => {
		const { brandShare, entries } = computeShareOfVoice({ name: "Nike", mentions: 0 }, []);
		expect(brandShare).toBeNull();
		expect(entries[0]?.share).toBe(0);
	});
});

describe("computeOpportunity", () => {
	it("is 'none' when brands are mentioned in 10% of runs or fewer", () => {
		expect(computeOpportunity({ brandPresence: 0, competitorPresence: 0 }).tier).toBe("none");
		expect(computeOpportunity({ brandPresence: 0.08, competitorPresence: 0 }).tier).toBe("none");
		expect(computeOpportunity({ brandPresence: 0.05, competitorPresence: 0.1 }).tier).toBe("none"); // max == 10% (boundary)
		// just above the 10% floor → no longer "none"
		expect(computeOpportunity({ brandPresence: 0.13, competitorPresence: 0 }).tier).toBe("won");
	});

	it("marks a prompt 'won' when the brand is active and even or ahead", () => {
		expect(computeOpportunity({ brandPresence: 0.6, competitorPresence: 0.1 }).tier).toBe("won");
		expect(computeOpportunity({ brandPresence: 0.9, competitorPresence: 0.9 }).tier).toBe("won"); // active tie
		expect(computeOpportunity({ brandPresence: 0.6, competitorPresence: 0.1 }).score).toBe(0);
	});

	it("treats a hair-thin competitor lead as 'won' (held), not a low opportunity", () => {
		// competitors out-mention you by only 3pp → within the noise floor → held, score 0
		expect(computeOpportunity({ brandPresence: 0.1, competitorPresence: 0.13 })).toEqual({ score: 0, tier: "won" });
		// a clear 7pp lead clears the floor → a (low) opportunity
		expect(computeOpportunity({ brandPresence: 0.1, competitorPresence: 0.17 }).tier).toBe("low");
	});

	it("respects a custom minimum gap", () => {
		expect(computeOpportunity({ brandPresence: 0.1, competitorPresence: 0.13 }, undefined, 0).tier).toBe("low");
		expect(computeOpportunity({ brandPresence: 0.1, competitorPresence: 0.13 }, undefined, 0.05).tier).toBe("won");
	});

	it("tiers the competitor-vs-you gap when competitors lead", () => {
		expect(computeOpportunity({ brandPresence: 0, competitorPresence: 1 })).toEqual({ score: 1, tier: "high" });
		expect(computeOpportunity({ brandPresence: 0.5, competitorPresence: 1 }).tier).toBe("high"); // gap .5
		expect(computeOpportunity({ brandPresence: 0.6, competitorPresence: 0.9 }).tier).toBe("medium"); // gap .3
		expect(computeOpportunity({ brandPresence: 0.7, competitorPresence: 0.8 }).tier).toBe("low"); // gap .1
	});

	it("ignores grounding entirely — only mention activity matters", () => {
		// high competitor demand, brand absent → high opportunity regardless of any citation behaviour
		expect(computeOpportunity({ brandPresence: 0, competitorPresence: 0.9 }).tier).toBe("high");
	});

	it("respects a custom activity floor", () => {
		expect(computeOpportunity({ brandPresence: 0.2, competitorPresence: 0 }, 0.3).tier).toBe("none");
		expect(computeOpportunity({ brandPresence: 0.2, competitorPresence: 0 }, 0.1).tier).toBe("won");
	});
});

describe("shareOfVoiceTimeSeriesLVCF", () => {
	it("carries each prompt's last values forward across gap days", () => {
		const series = shareOfVoiceTimeSeriesLVCF(
			[
				{ promptId: "p1", date: "2026-01-01", brandMentions: 2, competitorMentions: 2 },
				{ promptId: "p1", date: "2026-01-03", brandMentions: 1, competitorMentions: 3 },
			],
			["2026-01-01", "2026-01-02", "2026-01-03"],
		);
		// day2 has no run, so it carries day1 (2/(2+2)=50%); day3 uses its own (1/(1+3)=25%)
		expect(series.map((s) => s.share)).toEqual([50, 50, 25]);
	});

	it("aggregates across prompts and yields null for days with no data", () => {
		const series = shareOfVoiceTimeSeriesLVCF(
			[
				{ promptId: "a", date: "2026-01-02", brandMentions: 1, competitorMentions: 0 },
				{ promptId: "b", date: "2026-01-02", brandMentions: 0, competitorMentions: 1 },
			],
			["2026-01-01", "2026-01-02"],
		);
		// day1: both prompts carry their earliest (day2) obs -> brand 1 / total 2 = 50
		expect(series[0]).toEqual({ date: "2026-01-01", share: 50 });
		expect(series[1]).toEqual({ date: "2026-01-02", share: 50 });
		expect(shareOfVoiceTimeSeriesLVCF([], ["2026-01-01"])).toEqual([{ date: "2026-01-01", share: null }]);
	});
});
