import { describe, expect, it } from "vitest";
import { mapPool } from "./pool.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapPool", () => {
	it("returns results in input order even when later items finish first", async () => {
		const results = await mapPool([30, 10, 20], 3, async (ms) => {
			await wait(ms);
			return ms * 2;
		});

		expect(results).toEqual([60, 20, 40]);
	});

	it("never runs more than the concurrency limit at once", async () => {
		const items = [1, 2, 3, 4, 5, 6, 7];
		let inFlight = 0;
		let peak = 0;

		await mapPool(items, 2, async (item) => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await wait(5);
			inFlight -= 1;
			return item;
		});

		expect(peak).toBe(2);
	});

	it("passes each item with its index", async () => {
		const results = await mapPool(["a", "b", "c"], 2, async (item, index) => `${index}:${item}`);

		expect(results).toEqual(["0:a", "1:b", "2:c"]);
	});

	it("passes every item exactly once", async () => {
		const items = ["a", "b", "c", "d", "e"];
		const seen: string[] = [];

		await mapPool(items, 3, async (item) => {
			seen.push(item);
			return item;
		});

		expect(seen.slice().sort()).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("resolves an empty list to an empty array without calling the function", async () => {
		let calls = 0;

		const results = await mapPool([], 4, async (item) => {
			calls += 1;
			return item;
		});

		expect(results).toEqual([]);
		expect(calls).toBe(0);
	});

	it("treats a concurrency below one as one", async () => {
		const results = await mapPool(["a", "b"], 0, async (x) => x);
		expect(results).toEqual(["a", "b"]);

		let inFlight = 0;
		let peak = 0;
		await mapPool([1, 2, 3], -3, async (x) => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await wait(5);
			inFlight -= 1;
			return x;
		});

		expect(peak).toBe(1);
	});

	it("accepts a concurrency larger than the list", async () => {
		const results = await mapPool([1, 2], 10, async (x) => x + 1);

		expect(results).toEqual([2, 3]);
	});

	it("rejects with the error thrown by the function", async () => {
		const error = new Error("boom");

		await expect(
			mapPool([1, 2, 3], 2, async (item) => {
				if (item === 2) throw error;
				return item;
			}),
		).rejects.toBe(error);
	});
});
