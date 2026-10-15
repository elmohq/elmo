import { describe, expect, it } from "vitest";
import { assertBucketAligned, bucketEnd, bucketStart } from "./bucket";

const at = (iso: string) => new Date(iso);

describe("bucketStart", () => {
	it("floors to the containing quarter hour", () => {
		expect(bucketStart(at("2026-01-15T10:17:23.456Z")).toISOString()).toBe("2026-01-15T10:15:00.000Z");
		expect(bucketStart(at("2026-01-15T10:47:00.000Z")).toISOString()).toBe("2026-01-15T10:45:00.000Z");
		expect(bucketStart(at("2026-01-15T23:59:59.999Z")).toISOString()).toBe("2026-01-15T23:45:00.000Z");
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
		expect(bucketEnd(at("2026-01-15T10:30:00.000Z")).toISOString()).toBe("2026-01-15T10:45:00.000Z");
	});
});

describe("assertBucketAligned", () => {
	it("accepts boundaries", () => {
		expect(() => assertBucketAligned(at("2026-01-15T10:30:00.000Z"))).not.toThrow();
	});

	it("rejects anything else", () => {
		expect(() => assertBucketAligned(at("2026-01-15T10:31:00.000Z"))).toThrow(/not aligned/);
		expect(() => assertBucketAligned(at("2026-01-15T10:30:00.001Z"))).toThrow();
	});
});
