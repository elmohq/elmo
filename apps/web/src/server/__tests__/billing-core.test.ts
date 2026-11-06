import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ billingInterval: null as string | null }));

vi.mock("@workspace/deployment", () => ({ getDeployment: () => ({ features: { billing: true } }) }));

vi.mock("@workspace/lib/db/db", () => {
	const chain: Record<string | symbol, unknown> = new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === "then") return (resolve: (rows: unknown[]) => unknown) => resolve([{ id: "org_1" }]);
				return () => chain;
			},
		},
	);
	return { db: chain };
});

vi.mock("@workspace/lib/entitlements", () => ({
	getOrgBillingState: async () => ({
		entitlements: { planKey: "starter", standing: "active", trackingActive: true },
		subscription: { billingInterval: state.billingInterval, periodEnd: null, cancelAtPeriodEnd: false },
	}),
	countOrgBrands: async () => 0,
	countOrgEnabledPrompts: async () => 0,
	countOrgAssignedPremiumSlots: async () => 0,
}));

const { organizationBilling } = await import("../billing-core");

describe("organizationBilling", () => {
	beforeEach(() => {
		state.billingInterval = null;
	});

	it.each([
		["month", "monthly"],
		["year", "annual"],
	])("reports the provider's %s as %s", async (stored, expected) => {
		state.billingInterval = stored;
		const billing = await organizationBilling("org_1");
		expect(billing.plan?.interval).toBe(expected);
	});

	it("reports no interval where the plan has no subscription behind it", async () => {
		const billing = await organizationBilling("org_1");
		expect(billing.plan?.interval).toBeNull();
	});
});
