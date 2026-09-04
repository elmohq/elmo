import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryTransient } from "./scrape-shared";

describe("retryTransient", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("returns the first successful attempt without waiting", async () => {
		const attempt = vi.fn(async () => ({ result: "ok" }));
		await expect(retryTransient(attempt, (e) => e)).resolves.toBe("ok");
		expect(attempt).toHaveBeenCalledTimes(1);
	});

	it("backs off between failures and gives up after three attempts", async () => {
		const attempt = vi.fn(async (i: number) => ({ error: `fail ${i}` }));
		const run = retryTransient(attempt, (last) => `exhausted: ${last}`);
		const rejection = expect(run).rejects.toThrow("exhausted: fail 2");
		await vi.advanceTimersByTimeAsync(1500);
		expect(attempt).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(3000);
		expect(attempt).toHaveBeenCalledTimes(3);
		await rejection;
	});
});
