import { describe, expect, it } from "vitest";
import { BUCKET_MS, type DirtyReason } from "./constants";
import { coalesceMarks, type DirtyMark } from "./dirty";

const base = Date.parse("2026-01-15T00:00:00.000Z");
const bucket = (index: number) => new Date(base + index * BUCKET_MS);
const mark = (brandId: string, index: number, reason: DirtyReason = "run"): DirtyMark => ({
	brandId,
	bucket: bucket(index),
	reason,
});
const spans = (ranges: { from: Date; toExclusive: Date; brandId: string }[]) =>
	ranges.map((r) => [r.brandId, r.from.toISOString(), r.toExclusive.toISOString()]);

describe("coalesceMarks", () => {
	it("returns nothing for no marks", () => {
		expect(coalesceMarks([])).toEqual([]);
	});

	it("turns one mark into a single-bucket range", () => {
		const ranges = coalesceMarks([mark("a", 4)]);
		expect(spans(ranges)).toEqual([["a", bucket(4).toISOString(), bucket(5).toISOString()]]);
		expect(ranges[0].marks).toEqual([mark("a", 4)]);
	});

	it("merges consecutive buckets into one range", () => {
		const ranges = coalesceMarks([mark("a", 2), mark("a", 0), mark("a", 1)]);
		expect(spans(ranges)).toEqual([["a", bucket(0).toISOString(), bucket(3).toISOString()]]);
		expect(ranges[0].marks).toHaveLength(3);
	});

	it("swallows a single missing bucket but splits on a wider gap", () => {
		const ranges = coalesceMarks([mark("a", 0), mark("a", 2), mark("a", 5)]);
		expect(spans(ranges)).toEqual([
			["a", bucket(0).toISOString(), bucket(3).toISOString()],
			["a", bucket(5).toISOString(), bucket(6).toISOString()],
		]);
	});

	it("keeps brands apart", () => {
		const ranges = coalesceMarks([mark("b", 0), mark("a", 0), mark("a", 1)]);
		expect(spans(ranges)).toEqual([
			["a", bucket(0).toISOString(), bucket(2).toISOString()],
			["b", bucket(0).toISOString(), bucket(1).toISOString()],
		]);
	});

	it("caps a range at maxBuckets", () => {
		const marks = Array.from({ length: 5 }, (_, i) => mark("a", i));
		const ranges = coalesceMarks(marks, 2);
		expect(spans(ranges)).toEqual([
			["a", bucket(0).toISOString(), bucket(2).toISOString()],
			["a", bucket(2).toISOString(), bucket(4).toISOString()],
			["a", bucket(4).toISOString(), bucket(5).toISOString()],
		]);
		expect(ranges.flatMap((r) => r.marks)).toHaveLength(5);
	});

	it("covers a day by default", () => {
		const marks = Array.from({ length: 48 }, (_, i) => mark("a", i));
		expect(coalesceMarks(marks)).toHaveLength(1);
		expect(coalesceMarks([...marks, mark("a", 48)])).toHaveLength(2);
	});

	it("keeps every mark so a failed rebuild can restore them", () => {
		const marks = [mark("a", 0, "run"), mark("a", 1, "backfill"), mark("b", 9, "reprocess")];
		expect(coalesceMarks(marks).flatMap((r) => r.marks)).toEqual(
			expect.arrayContaining(marks.map((m) => expect.objectContaining({ reason: m.reason }))),
		);
	});

	it("does not depend on input order", () => {
		const marks = [mark("b", 3), mark("a", 0), mark("a", 1), mark("b", 4)];
		expect(coalesceMarks(marks)).toEqual(coalesceMarks([...marks].reverse()));
	});
});
