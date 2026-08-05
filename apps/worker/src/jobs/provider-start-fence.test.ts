import { describe, expect, it, vi } from "vitest";
import { withProviderStartEntitlementFence } from "./provider-start-fence";

describe("provider start entitlement fence", () => {
	it("cannot authorize a provider until the organization capacity lock is held", async () => {
		let releaseLock: (() => void) | undefined;
		const lock = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					releaseLock = resolve;
				}),
		);
		const resolveCurrentEligibility = vi.fn(async () => true);
		const authorize = vi.fn(async () => true);
		const pending = withProviderStartEntitlementFence({
			tx: {} as never,
			organizationId: "org-1",
			lock,
			resolveCurrentEligibility,
			authorize,
		});

		await Promise.resolve();
		expect(lock).toHaveBeenCalledWith({}, "org-1");
		expect(resolveCurrentEligibility).not.toHaveBeenCalled();
		expect(authorize).not.toHaveBeenCalled();
		releaseLock?.();
		await expect(pending).resolves.toBe(true);
		expect(authorize).toHaveBeenCalledOnce();
	});

	it("does not start a provider when current lifecycle entitlements have expired", async () => {
		const authorize = vi.fn(async () => true);
		await expect(
			withProviderStartEntitlementFence({
				tx: {} as never,
				organizationId: "org-1",
				lock: vi.fn(async () => undefined),
				resolveCurrentEligibility: vi.fn(async () => false),
				authorize,
			}),
		).resolves.toBe(false);
		expect(authorize).not.toHaveBeenCalled();
	});
});
