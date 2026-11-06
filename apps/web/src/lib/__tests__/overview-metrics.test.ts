import { describe, expect, it } from "vitest";
import { METRIC_META } from "@/lib/overview-metrics";

describe("METRIC_META", () => {
	describe("AI Visibility", () => {
		const { grade, format, formatChange } = METRIC_META.visibility;

		it.each([
			[0.9, "good"],
			[0.76, "good"],
			[0.75, "fair"], // exclusive: exactly 75% is fair
			[0.46, "fair"],
			[0.45, "poor"], // exclusive: exactly 45% is poor
			[0, "poor"],
		])("grades %s as %s", (value, expected) => {
			expect(grade(value as number, 1)).toBe(expected);
		});

		it.each([
			[0.426, "43%"],
			[0, "0%"],
			[1, "100%"],
		])("formats %s as %s", (value, expected) => {
			expect(format(value as number)).toBe(expected);
		});

		it.each([
			[0.12, "12pt"],
			[-0.12, "12pt"],
		])("formats the change %s as %s without a sign", (change, expected) => {
			expect(formatChange(change as number)).toBe(expected);
		});
	});

	describe("Share of Voice", () => {
		const { grade, format, formatChange } = METRIC_META.share;

		it.each([
			[0.01, 1, "good"], // a small share still counts as good when it's the top one
			[0.9, 2, "fair"],
			[0.9, 3, "fair"],
			[0.9, 4, "poor"], // three companies ahead: poor however large the share
			[0.9, 7, "poor"],
		])("grades %s at rank %s as %s", (value, rank, expected) => {
			expect(grade(value as number, rank as number)).toBe(expected);
		});

		it.each([
			[0.333, "33%"],
			[0.75, "75%"],
		])("formats %s as %s", (value, expected) => {
			expect(format(value as number)).toBe(expected);
		});

		it.each([
			[-0.07, "7pt"],
			[0.07, "7pt"],
		])("formats the change %s as %s without a sign", (change, expected) => {
			expect(formatChange(change as number)).toBe(expected);
		});
	});

	describe("Sentiment", () => {
		const { grade, format, formatChange } = METRIC_META.sentiment;

		it.each([
			[1, "good"],
			[0.65, "good"], // inclusive boundary
			[0.64, "fair"],
			[0.5, "fair"], // 50 is neutral, so fair
			[0.49, "poor"],
			[0, "poor"],
		])("grades %s as %s", (value, expected) => {
			expect(grade(value as number, 1)).toBe(expected);
		});

		it.each([
			[0.5, "50"],
			[0.724, "72"],
		])("formats %s as %s — a score out of 100, no % sign", (value, expected) => {
			expect(format(value as number)).toBe(expected);
		});

		it.each([
			[0.08, "8"],
			[-0.08, "8"],
		])("formats the change %s as the plain number %s", (change, expected) => {
			expect(formatChange(change as number)).toBe(expected);
		});
	});

	describe("Position", () => {
		const { grade, format, formatChange } = METRIC_META.position;

		it.each([
			[1, "good"],
			[1.5, "good"], // inclusive boundary
			[1.6, "fair"],
			[2.5, "fair"], // inclusive boundary
			[2.6, "poor"],
			[4, "poor"],
		])("grades %s as %s", (value, expected) => {
			expect(grade(value as number, 1)).toBe(expected);
		});

		it.each([
			[1, "1.0"],
			[2.34, "2.3"],
		])("formats %s as %s — one decimal place", (value, expected) => {
			expect(format(value as number)).toBe(expected);
		});

		it.each([
			[-0.5, "0.5"],
			[1.2, "1.2"],
		])("formats the change %s as %s with one decimal place, no sign", (change, expected) => {
			expect(formatChange(change as number)).toBe(expected);
		});
	});
});
