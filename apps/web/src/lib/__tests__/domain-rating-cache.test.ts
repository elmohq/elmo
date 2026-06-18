import { describe, expect, it } from "vitest";
import { AhrefsRetryableError, type DomainRatingResult } from "@workspace/lib/ahrefs";
import { DomainRatingCache } from "../domain-rating-cache";

const ok = (rating: number): DomainRatingResult => ({ status: "ok", rating });
const notFound = (): DomainRatingResult => ({ status: "not_found", rating: null });

describe("DomainRatingCache", () => {
	it("reports all domains missing on a cold cache", () => {
		const cache = new DomainRatingCache(":memory:");
		const { ratings, missing } = cache.load(["a.com", "b.com"]);
		expect(ratings.size).toBe(0);
		expect([...missing].sort()).toEqual(["a.com", "b.com"]);
	});

	it("warms misses and then serves them, including known not_found", async () => {
		const cache = new DomainRatingCache(":memory:");
		const fetcher = async (d: string) => (d === "a.com" ? ok(50) : notFound());
		const res = await cache.warm(["a.com", "b.com"], { fetcher });
		expect(res.fetched).toBe(2);

		const { ratings, missing } = cache.load(["a.com", "b.com"]);
		expect(missing).toEqual([]);
		expect(ratings.get("a.com")).toBe(50);
		expect(ratings.get("b.com")).toBeNull(); // resolved with no rating, not missing
	});

	it("normalizes domains (protocol / www / path / case)", async () => {
		const cache = new DomainRatingCache(":memory:");
		const seen: string[] = [];
		const fetcher = async (d: string) => {
			seen.push(d);
			return ok(10);
		};
		await cache.warm(["https://www.Example.com/some/path"], { fetcher });
		expect(seen).toEqual(["example.com"]);
		expect(cache.load(["EXAMPLE.com"]).ratings.get("example.com")).toBe(10);
	});

	it("respects the warm limit", async () => {
		const cache = new DomainRatingCache(":memory:");
		let calls = 0;
		const fetcher = async () => {
			calls++;
			return ok(1);
		};
		const res = await cache.warm(["a.com", "b.com", "c.com", "d.com", "e.com"], { fetcher, limit: 2 });
		expect(calls).toBe(2);
		expect(res.fetched).toBe(2);
	});

	it("backs off and caches nothing when throttled", async () => {
		const cache = new DomainRatingCache(":memory:");
		const fetcher = async () => {
			throw new AhrefsRetryableError(429, "rate limited");
		};
		const res = await cache.warm(["a.com", "b.com"], { fetcher, concurrency: 1 });
		expect(res.throttled).toBe(true);
		expect(res.fetched).toBe(0);
		expect(cache.load(["a.com", "b.com"]).missing.length).toBe(2);
	});

	it("refetches ok rows only after the freshness window", () => {
		const cache = new DomainRatingCache(":memory:");
		cache.upsert("a.com", 50, "ok", 0);
		expect(cache.load(["a.com"], 1000).missing).toEqual([]); // fresh
		const farFuture = 40 * 24 * 60 * 60 * 1000; // > 30 days
		expect(cache.load(["a.com"], farFuture).missing).toEqual(["a.com"]);
	});

	it("retries not_found rows sooner than ok rows", () => {
		const cache = new DomainRatingCache(":memory:");
		cache.upsert("a.com", null, "not_found", 0);
		const fiveDays = 5 * 24 * 60 * 60 * 1000; // past the 3-day retry window, within the 30-day ok window
		expect(cache.load(["a.com"], fiveDays).missing).toEqual(["a.com"]);
	});
});
