import { describe, expect, it } from "vitest";
import { chunked } from "./chunk";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("chunked", () => {
	it("puts the remainder in a final, shorter chunk", () => {
		expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	it("does not add an empty trailing chunk when the input divides evenly", () => {
		expect(chunked([1, 2, 3, 4], 2)).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("returns one chunk when the input is shorter than the requested size", () => {
		expect(chunked([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
	});

	it("supports one-item string chunks", () => {
		expect(chunked(["a", "b", "c"], 1)).toEqual([["a"], ["b"], ["c"]]);
	});

	it("returns no chunks for an empty array", () => {
		expect(chunked([])).toEqual([]);
	});

	it("splits into chunks of 500 by default", () => {
		expect(chunked(range(500)).map((chunk) => chunk.length)).toEqual([500]);
		expect(chunked(range(501)).map((chunk) => chunk.length)).toEqual([500, 1]);
		expect(chunked(range(1200)).map((chunk) => chunk.length)).toEqual([500, 500, 200]);
	});

	it("preserves every item in its original order", () => {
		const input = range(1200);
		expect(chunked(input).flat()).toEqual(input);
	});

	it("does not mutate the input", () => {
		const input = [1, 2, 3];
		chunked(input, 2);
		expect(input).toEqual([1, 2, 3]);
	});
});
