import { describe, expect, it } from "vitest";
import { classifyAuthorityRegime, computeDrCorrelation, describeCorrelationStrength, type DrPoint } from "./dr-correlation";

function point(domain: string, rating: number | null, count: number): DrPoint {
	return { domain, rating, count, category: "other" };
}

describe("computeDrCorrelation", () => {
	it("returns a perfect positive Spearman for a monotonic increasing relationship", () => {
		const r = computeDrCorrelation([point("a", 10, 2), point("b", 20, 3), point("c", 30, 4), point("d", 40, 5)]);
		expect(r.n).toBe(4);
		expect(r.spearman).toBeCloseTo(1, 5);
	});

	it("returns a perfect negative Spearman for a monotonic decreasing relationship", () => {
		const r = computeDrCorrelation([point("a", 10, 5), point("b", 20, 4), point("c", 30, 3), point("d", 40, 2)]);
		expect(r.spearman).toBeCloseTo(-1, 5);
	});

	it("ignores domains with no rating", () => {
		const r = computeDrCorrelation([point("a", 50, 5), point("b", null, 99), point("c", 60, 6)]);
		expect(r.n).toBe(2);
		expect(r.scatter.map((s) => s.domain)).toEqual(["a", "c"]);
	});

	it("returns null coefficients when there is no variance in DR", () => {
		const r = computeDrCorrelation([point("a", 50, 2), point("b", 50, 3), point("c", 50, 4)]);
		expect(r.spearman).toBeNull();
		expect(r.pearsonLog).toBeNull();
	});

	it("returns null coefficients when there are fewer than two rated domains", () => {
		const r = computeDrCorrelation([point("a", 50, 5), point("b", null, 5)]);
		expect(r.n).toBe(1);
		expect(r.spearman).toBeNull();
		expect(r.confidence).toBe("low");
	});

	it("marks confidence ok only once there are enough rated domains", () => {
		const few = computeDrCorrelation(Array.from({ length: 14 }, (_, i) => point(`d${i}`, i + 1, i + 2)));
		expect(few.confidence).toBe("low");
		const many = computeDrCorrelation(Array.from({ length: 15 }, (_, i) => point(`d${i}`, i + 1, i + 2)));
		expect(many.confidence).toBe("ok");
	});

	it("surfaces rank-gap outliers on both sides", () => {
		const r = computeDrCorrelation([
			point("above", 5, 100), // low DR, heavily cited
			point("under", 90, 2), // high DR, barely cited
			point("c", 50, 50),
			point("d", 40, 40),
			point("e", 60, 30),
			point("f", 30, 20),
		]);
		expect(r.outliers.aboveWeight[0]?.domain).toBe("above");
		expect(r.outliers.aboveWeight[0]?.rankGap).toBeGreaterThan(0);
		expect(r.outliers.underperforming[0]?.domain).toBe("under");
		expect(r.outliers.underperforming[0]?.rankGap).toBeLessThan(0);
	});

	it("excludes count < 2 domains from outliers", () => {
		const r = computeDrCorrelation([
			point("oneoff", 1, 1), // would be a huge above-weight outlier, but count < 2
			point("a", 50, 50),
			point("b", 40, 40),
			point("c", 60, 30),
			point("d", 30, 20),
		]);
		expect(r.outliers.aboveWeight.find((o) => o.domain === "oneoff")).toBeUndefined();
	});

	it("handles the empty input", () => {
		const r = computeDrCorrelation([]);
		expect(r).toMatchObject({ n: 0, spearman: null, pearsonLog: null, confidence: "low" });
		expect(r.scatter).toEqual([]);
		expect(r.outliers).toEqual({ aboveWeight: [], underperforming: [] });
	});
});

describe("classifyAuthorityRegime", () => {
	it("flags authority-gated when correlation is moderate and brand is below the bar", () => {
		const r = classifyAuthorityRegime(0.31, 59, 68);
		expect(r.regime).toBe("authority");
		expect(r.aboveBar).toBe(false);
	});

	it("flags content-gated when correlation is weak", () => {
		const r = classifyAuthorityRegime(0.15, 51, 47);
		expect(r.regime).toBe("content");
		expect(r.aboveBar).toBe(true);
	});

	it("handles unknown brand DR", () => {
		const r = classifyAuthorityRegime(0.4, null, 60);
		expect(r.regime).toBe("authority");
		expect(r.aboveBar).toBeNull();
	});
});

describe("describeCorrelationStrength", () => {
	it("describes strength and direction", () => {
		expect(describeCorrelationStrength(0.05)).toBe("no meaningful");
		expect(describeCorrelationStrength(0.2)).toBe("a weak positive");
		expect(describeCorrelationStrength(0.4)).toBe("a moderate positive");
		expect(describeCorrelationStrength(0.6)).toBe("a strong positive");
		expect(describeCorrelationStrength(0.9)).toBe("a very strong positive");
		expect(describeCorrelationStrength(-0.4)).toBe("a moderate negative");
	});
});
