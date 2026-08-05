import type { Job } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createStripeClient: vi.fn(),
	reconcileMutations: vi.fn(),
	reconcileSubscriptions: vi.fn(),
	reconcileRetention: vi.fn(),
}));

vi.mock("@workspace/cloud/billing-control", () => ({
	CLOUD_BILLING_RECONCILIATION_QUEUE: "cloud-billing-reconciliation-v1",
	reconcilePendingCloudBillingMutations: mocks.reconcileMutations,
}));
vi.mock("@workspace/cloud/data-retention", () => ({
	reconcileCloudDataRetention: mocks.reconcileRetention,
}));
vi.mock("@workspace/cloud/stripe-client", () => ({
	createCloudStripeClient: mocks.createStripeClient,
}));
vi.mock("@workspace/cloud/subscription-reconciliation", () => ({
	reconcileAuthoritativeCloudSubscriptions: mocks.reconcileSubscriptions,
}));

import { reconcileCloudBillingJob } from "./reconcile-cloud-billing";

const job = { data: { source: "scheduled" } } as Job<{ source: "scheduled" | "manual" }>;

describe("cloud billing maintenance isolation", () => {
	const originalMode = process.env.DEPLOYMENT_MODE;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createStripeClient.mockReturnValue({ id: "stripe" });
		mocks.reconcileMutations.mockResolvedValue({ applied: 0, failed: 0, pending: 0, deferred: 0 });
		mocks.reconcileSubscriptions.mockResolvedValue({ reconciled: 0, failed: 0 });
		mocks.reconcileRetention.mockResolvedValue({
			due: 0,
			confirmed: 0,
			purged: 0,
			canceled: 0,
			deferred: 0,
			superseded: 0,
			failed: 0,
			errors: [],
		});
	});

	afterEach(() => {
		if (originalMode === undefined) delete process.env.DEPLOYMENT_MODE;
		else process.env.DEPLOYMENT_MODE = originalMode;
		vi.restoreAllMocks();
	});

	it.each(["local", "whitelabel"])("performs no Stripe or retention reads in %s mode", async (mode) => {
		process.env.DEPLOYMENT_MODE = mode;
		await reconcileCloudBillingJob([job]);
		expect(mocks.createStripeClient).not.toHaveBeenCalled();
		expect(mocks.reconcileMutations).not.toHaveBeenCalled();
		expect(mocks.reconcileSubscriptions).not.toHaveBeenCalled();
		expect(mocks.reconcileRetention).not.toHaveBeenCalled();
	});

	it("runs retention only after both authoritative billing phases succeed", async () => {
		process.env.DEPLOYMENT_MODE = "cloud";
		mocks.reconcileRetention.mockResolvedValue({
			due: 2,
			confirmed: 1,
			purged: 1,
			canceled: 0,
			deferred: 0,
			superseded: 0,
			failed: 0,
			errors: [],
		});
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

		await reconcileCloudBillingJob([job]);

		expect(mocks.reconcileMutations).toHaveBeenCalledOnce();
		expect(mocks.reconcileSubscriptions).toHaveBeenCalledOnce();
		expect(mocks.reconcileRetention).toHaveBeenCalledOnce();
		expect(mocks.reconcileRetention.mock.invocationCallOrder[0]).toBeGreaterThan(
			mocks.reconcileSubscriptions.mock.invocationCallOrder[0] ?? 0,
		);
		expect(log).toHaveBeenCalledWith(
			"[cloud-billing-reconciliation-v1]",
			expect.objectContaining({
				retention: expect.objectContaining({ due: 2, confirmed: 1, purged: 1, failed: 0 }),
			}),
		);
	});

	it("skips destructive eligibility checks when billing reconciliation fails", async () => {
		process.env.DEPLOYMENT_MODE = "cloud";
		mocks.reconcileSubscriptions.mockRejectedValue(new Error("Stripe reconciliation failed"));

		await expect(reconcileCloudBillingJob([job])).rejects.toThrow("cloud billing reconciliation phase");
		expect(mocks.reconcileRetention).not.toHaveBeenCalled();
	});

	it("surfaces retained failure counts for pg-boss retry and operator logs", async () => {
		process.env.DEPLOYMENT_MODE = "cloud";
		const failure = new Error("retention verification failed");
		mocks.reconcileRetention.mockResolvedValue({
			due: 1,
			confirmed: 0,
			purged: 0,
			canceled: 0,
			deferred: 0,
			superseded: 0,
			failed: 1,
			errors: [failure],
		});
		const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

		await expect(reconcileCloudBillingJob([job])).rejects.toThrow("cloud billing reconciliation phase");
		expect(log).toHaveBeenCalledWith(
			"[cloud-billing-reconciliation-v1]",
			expect.objectContaining({ retention: expect.objectContaining({ due: 1, failed: 1 }) }),
		);
	});
});
