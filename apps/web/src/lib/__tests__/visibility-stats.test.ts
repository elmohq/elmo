import { describe, it, expect } from "vitest";
import {
	computeVolatility,
	computeConcentration,
	computePoolStats,
	citationCoverage,
	groundingMode,
	stabilityScore,
	computeShareOfVoice,
	computeWinnability,
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

describe("citationCoverage / groundingMode", () => {
	it("is null when the model never ran", () => {
		expect(citationCoverage(0, 0)).toBeNull();
	});

	it("computes cited-days / run-days and clamps cited <= run", () => {
		expect(citationCoverage(42, 21)).toBe(0.5);
		expect(citationCoverage(10, 12)).toBe(1); // clamped
	});

	it("buckets coverage into grounding modes", () => {
		expect(groundingMode(null)).toBe("from-memory");
		expect(groundingMode(0.05)).toBe("from-memory");
		expect(groundingMode(0.5)).toBe("mixed");
		expect(groundingMode(0.95)).toBe("grounded");
		expect(groundingMode(0.7)).toBe("grounded"); // boundary
		expect(groundingMode(0.3)).toBe("mixed"); // boundary
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

describe("computeWinnability", () => {
	it("scores zero when the brand is already as present as competitors", () => {
		const r = computeWinnability({ brandPresence: 0.9, competitorPresence: 0.9, coverage: 1, volatility: 0.6 });
		expect(r.score).toBe(0);
		expect(r.tier).toBe("low");
	});

	it("scores high for a grounded, contested prompt the brand is absent from", () => {
		const r = computeWinnability({ brandPresence: 0, competitorPresence: 1, coverage: 1, volatility: 1 });
		expect(r.score).toBe(1); // gap 1 * grounded 1 * contestable 1
		expect(r.tier).toBe("high");
		expect(r.play).toBe("citation");
	});

	it("flags a mentions play when the engine answers from memory", () => {
		const r = computeWinnability({ brandPresence: 0.1, competitorPresence: 0.9, coverage: 0.1, volatility: null });
		expect(r.play).toBe("mention");
		// gap .8 * grounded .1 * contestable .75 = .06 -> low (no citation slot to win)
		expect(r.tier).toBe("low");
	});

	it("lands mid-range cases in the medium tier", () => {
		// gap .5 * grounded .8 * contestable (0.5 + 0.5*0.5 = .75) = .3
		const r = computeWinnability({ brandPresence: 0.2, competitorPresence: 0.7, coverage: 0.8, volatility: 0.5 });
		expect(r.score).toBeCloseTo(0.3, 5);
		expect(r.tier).toBe("medium");
	});

	it("treats unknown volatility neutrally rather than zeroing the score", () => {
		const withNull = computeWinnability({ brandPresence: 0, competitorPresence: 1, coverage: 1, volatility: null });
		const withHalf = computeWinnability({ brandPresence: 0, competitorPresence: 1, coverage: 1, volatility: 0.5 });
		expect(withNull.score).toBe(withHalf.score); // null -> 0.5
		expect(withNull.score).toBe(0.75);
	});
});
