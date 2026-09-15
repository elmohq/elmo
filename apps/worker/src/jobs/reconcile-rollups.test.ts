import type { BucketComparison } from "@workspace/lib/rollups";
import { describe, expect, it } from "vitest";
import { isMismatch } from "./reconcile-rollups";

const agreeing: BucketComparison = { runs: [5, 5], brandMentioned: [3, 3], citations: [10, 10] };

describe("isMismatch", () => {
	it("is false when every pair agrees", () => {
		expect(isMismatch(agreeing)).toBe(false);
	});

	it("is true when runs disagree", () => {
		expect(isMismatch({ ...agreeing, runs: [5, 6] })).toBe(true);
	});

	it("is true when brand-mentioned counts disagree", () => {
		expect(isMismatch({ ...agreeing, brandMentioned: [3, 4] })).toBe(true);
	});

	it("is true when citation counts disagree", () => {
		expect(isMismatch({ ...agreeing, citations: [10, 9] })).toBe(true);
	});
});
