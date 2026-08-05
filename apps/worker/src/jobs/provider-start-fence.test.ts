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
		const authorize = vi.fn(async () => true);
		const pending = withProviderStartEntitlementFence({
			tx: {} as never,
			organizationId: "org-1",
			lock,
			authorize,
		});

		await Promise.resolve();
		expect(lock).toHaveBeenCalledWith({}, "org-1");
		expect(authorize).not.toHaveBeenCalled();
		releaseLock?.();
		await expect(pending).resolves.toBe(true);
		expect(authorize).toHaveBeenCalledOnce();
	});
});
