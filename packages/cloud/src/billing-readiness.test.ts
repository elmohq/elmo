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

	it("keeps cloud traffic closed after catalog validation fails", async () => {
		const error = new Error("duplicate lookup key");
		const validate = vi.fn(async () => {
			throw error;
		});
		const assertReady = createCloudBillingReadinessGate({ mode: "cloud", validate });

		await expect(assertReady()).rejects.toBe(error);
		await expect(assertReady()).rejects.toBe(error);
		expect(validate).toHaveBeenCalledOnce();
	});
});
