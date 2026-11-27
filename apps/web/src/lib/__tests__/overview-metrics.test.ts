import { describe, expect, it } from "vitest";
import { METRIC_META } from "@/lib/overview-metrics";

describe("METRIC_META", () => {
	describe("AI Visibility", () => {
		const { format, formatChange, grade } = METRIC_META.visibility;

		it.each([
			[0.9, "good"],
			[0.76, "good"],
			[0.75, "fair"],
			[0.46, "fair"],
			[0.45, "poor"],
			[0, "poor"],
		] as const)("grades a visibility of %s as %s", (value, expected) => {
			expect(grade(value, 1)).toBe(expected);
		});

		it("grades exactly 75% as fair, not good", () => {
			expect(grade(0.75, 1)).toBe("fair");
		});

		it("grades exactly 45% as poor, not fair", () => {
			expect(grade(0.45, 1)).toBe("poor");
		});

		it("shows the value as a rounded percent", () => {
			expect(format(0.426)).toBe("43%");
			expect(format(0)).toBe("0%");
			expect(format(1)).toBe("100%");
		});

		it("shows a change in percentage points without a sign", () => {
			expect(formatChange(0.12)).toBe("12pt");
			expect(formatChange(-0.12)).toBe("12pt");
		});
	});

	describe("Share of Voice", () => {
		const { format, formatChange, grade } = METRIC_META.share;

		it("grades share of voice by rank, not by size", () => {
			expect(grade(0.01, 1)).toBe("good");
			expect(grade(0.9, 4)).toBe("poor");
		});

		it.each([
			[1, "good"],
			[2, "fair"],
			[3, "fair"],
			[4, "poor"],
		] as const)("grades rank %s as %s", (rank, expected) => {
			expect(grade(0.9, rank)).toBe(expected);
		});

		it("shows the value as a rounded percent", () => {
			expect(format(0.333)).toBe("33%");
		});

		it("shows a change in percentage points without a sign", () => {
			expect(formatChange(-0.07)).toBe("7pt");
		});
	});

	describe("Sentiment", () => {
		const { format, formatChange, grade } = METRIC_META.sentiment;

		it.each([
			[1, "good"],
			[0.65, "good"],
			[0.64, "fair"],
			[0.5, "fair"],
			[0.49, "poor"],
			[0, "poor"],
		] as const)("grades a sentiment of %s as %s", (value, expected) => {
			expect(grade(value, 1)).toBe(expected);
		});

		it("grades a neutral score of 50 as fair", () => {
			expect(grade(0.5, 1)).toBe("fair");
		});

		it("shows the value as a score out of 100 with no percent sign", () => {
			expect(format(0.5)).toBe("50");
			expect(format(0.724)).toBe("72");
		});

		it("shows a change as a plain number without a sign", () => {
			expect(formatChange(0.08)).toBe("8");
			expect(formatChange(-0.08)).toBe("8");
		});
	});

	describe("Position", () => {
		const { format, formatChange, grade } = METRIC_META.position;

		it.each([
			[1, "good"],
			[1.5, "good"],
			[1.6, "fair"],
			[2.5, "fair"],
			[2.6, "poor"],
			[4, "poor"],
		] as const)("grades a position of %s as %s", (value, expected) => {
			expect(grade(value, 1)).toBe(expected);
		});

		it("grades a lower position as better", () => {
			expect(grade(1, 1)).toBe("good");
			expect(grade(4, 1)).toBe("poor");
		});

		it("shows the value with one decimal place", () => {
			expect(format(1)).toBe("1.0");
			expect(format(2.34)).toBe("2.3");
		});

		it("shows a change with one decimal place and no sign", () => {
			expect(formatChange(-0.5)).toBe("0.5");
			expect(formatChange(1.2)).toBe("1.2");
		});
	});
});
