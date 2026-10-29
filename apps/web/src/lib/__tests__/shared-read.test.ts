import { afterEach, describe, expect, it, vi } from "vitest";
import { sharedRead } from "@/lib/shared-read";

describe("sharedRead", () => {
	afterEach(() => vi.useRealTimers());

	it("runs a read once for every caller asking for the same key at the same time", async () => {
		const read = vi.fn(async () => ["example.com"]);
		const results = await Promise.all([sharedRead("same", read), sharedRead("same", read), sharedRead("same", read)]);
		expect(read).toHaveBeenCalledTimes(1);
		expect(results).toEqual([["example.com"], ["example.com"], ["example.com"]]);
	});

	it("reads again once the shared result has expired", async () => {
		vi.useFakeTimers();
		const read = vi.fn(async () => 1);
		await sharedRead("expiring", read);
		vi.advanceTimersByTime(31_000);
		await sharedRead("expiring", read);
		expect(read).toHaveBeenCalledTimes(2);
	});

	it("retries a read that failed instead of sharing the failure", async () => {
		const read = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce("ok");
		await expect(sharedRead("failing", read)).rejects.toThrow("timeout");
		await expect(sharedRead("failing", read)).resolves.toBe("ok");
	});
});
