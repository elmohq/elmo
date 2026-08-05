import { describe, expect, it, vi } from "vitest";
import { createCloudBillingReadinessGate } from "./billing-readiness";

describe("cloud billing readiness gate", () => {
	it("does not initialize or validate billing outside cloud", async () => {
		const validate = vi.fn(async () => undefined);
		const assertReady = createCloudBillingReadinessGate({ mode: "whitelabel", validate });

		await expect(assertReady()).resolves.toBeUndefined();
		expect(validate).not.toHaveBeenCalled();
	});

	it("shares one successful catalog validation across requests", async () => {
		const validate = vi.fn(async () => undefined);
		const assertReady = createCloudBillingReadinessGate({ mode: "cloud", validate });

		await Promise.all([assertReady(), assertReady(), assertReady()]);
		expect(validate).toHaveBeenCalledOnce();
	});

	it("keeps cloud traffic closed while cooling down after validation fails", async () => {
		let currentTime = 1_000;
		const firstError = new Error("Stripe is temporarily unavailable");
		const validate = vi.fn().mockRejectedValueOnce(firstError).mockResolvedValueOnce(undefined);
		const assertReady = createCloudBillingReadinessGate({
			mode: "cloud",
			validate,
			retryAfterMs: 30_000,
			now: () => currentTime,
		});

		await expect(assertReady()).rejects.toBe(firstError);
		await expect(assertReady()).rejects.toBe(firstError);
		expect(validate).toHaveBeenCalledOnce();

		currentTime += 30_000;
		await expect(assertReady()).resolves.toBeUndefined();
		await expect(assertReady()).resolves.toBeUndefined();
		expect(validate).toHaveBeenCalledTimes(2);
	});
});
