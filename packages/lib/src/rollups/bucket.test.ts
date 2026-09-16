import { describe, expect, it } from "vitest";
import { assertBucketAligned, bucketEnd, bucketStart, bucketsBetween, isBucketAligned } from "./bucket";

const at = (iso: string) => new Date(iso);

describe("bucketStart", () => {
	it("floors to the containing half hour", () => {
		expect(bucketStart(at("2026-01-15T10:17:23.456Z")).toISOString()).toBe("2026-01-15T10:00:00.000Z");
		expect(bucketStart(at("2026-01-15T10:47:00.000Z")).toISOString()).toBe("2026-01-15T10:30:00.000Z");
		expect(bucketStart(at("2026-01-15T23:59:59.999Z")).toISOString()).toBe("2026-01-15T23:30:00.000Z");
	});

	it("leaves a boundary where it is", () => {
		expect(bucketStart(at("2026-01-15T10:30:00.000Z")).toISOString()).toBe("2026-01-15T10:30:00.000Z");
	});

	it("is idempotent", () => {
		const once = bucketStart(at("2026-01-15T10:17:23.456Z"));
		expect(bucketStart(once)).toEqual(once);
	});
});

describe("bucketEnd", () => {
	it("is the start of the next bucket", () => {
		expect(bucketEnd(at("2026-01-15T10:17:00.000Z")).toISOString()).toBe("2026-01-15T10:30:00.000Z");
		expect(bucketEnd(at("2026-01-15T10:30:00.000Z")).toISOString()).toBe("2026-01-15T11:00:00.000Z");
	});
});

describe("assertBucketAligned", () => {
	it("accepts boundaries", () => {
		expect(isBucketAligned(at("2026-01-15T10:30:00.000Z"))).toBe(true);
		expect(() => assertBucketAligned(at("2026-01-15T10:30:00.000Z"))).not.toThrow();
	});

	it("rejects anything else", () => {
		expect(isBucketAligned(at("2026-01-15T10:31:00.000Z"))).toBe(false);
		expect(() => assertBucketAligned(at("2026-01-15T10:31:00.000Z"))).toThrow(/not aligned/);
		expect(() => assertBucketAligned(at("2026-01-15T10:30:00.001Z"))).toThrow();
	});
});

describe("bucketsBetween", () => {
	it("lists every bucket start in the half-open range", () => {
		const buckets = bucketsBetween(at("2026-01-15T10:00:00.000Z"), at("2026-01-15T11:30:00.000Z"));
		expect(buckets.map((b) => b.toISOString())).toEqual([
			"2026-01-15T10:00:00.000Z",
			"2026-01-15T10:30:00.000Z",
			"2026-01-15T11:00:00.000Z",
		]);
	});

	it("is empty when the range is empty or inverted", () => {
		expect(bucketsBetween(at("2026-01-15T10:00:00.000Z"), at("2026-01-15T10:00:00.000Z"))).toEqual([]);
		expect(bucketsBetween(at("2026-01-15T11:00:00.000Z"), at("2026-01-15T10:00:00.000Z"))).toEqual([]);
	});

	it("starts from the bucket containing an unaligned bound", () => {
		const buckets = bucketsBetween(at("2026-01-15T10:20:00.000Z"), at("2026-01-15T11:00:00.000Z"));
		expect(buckets.map((b) => b.toISOString())).toEqual(["2026-01-15T10:00:00.000Z", "2026-01-15T10:30:00.000Z"]);
	});
});
