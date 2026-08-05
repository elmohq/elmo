import {
	CLOUD_ACTIVE_SUBSCRIPTION_SYNC_GRACE_MS,
	CLOUD_PAST_DUE_GRACE_MS,
} from "@workspace/config/billing-lifecycle";
import { describe, expect, it, vi } from "vitest";
import {
	type OrganizationEntitlementSourceSnapshot,
	type OrganizationEntitlementSourceStore,
	resolveOrganizationEntitlements,
	resolveOrganizationEntitlementSource,
} from "./entitlements";

const now = new Date("2026-08-05T12:00:00.000Z");

function source(
	overrides: Partial<OrganizationEntitlementSourceSnapshot> = {},
): OrganizationEntitlementSourceSnapshot {
	return {
		subscription: {
			stripeSubscriptionId: "sub_1",
			planId: "pro",
			status: "active",
			currentPeriodEnd: new Date("2026-08-31T00:00:00.000Z"),
			delinquentSince: null,
		},
		claudeAddonPromptSlots: 0,
		pendingBillingMutationId: null,
		entitlementRevisions: [],
		...overrides,
	};
}

function store(snapshot: OrganizationEntitlementSourceSnapshot): OrganizationEntitlementSourceStore {
	return { load: vi.fn().mockResolvedValue(snapshot) };
}

describe("resolveOrganizationEntitlements", () => {
	it.each(["local", "demo", "whitelabel"] as const)("does not read billing state in %s mode", async (mode) => {
		const sourceStore: OrganizationEntitlementSourceStore = {
			load: vi.fn().mockRejectedValue(new Error("must not run")),
		};
		const result = await resolveOrganizationEntitlements({
			mode,
			organizationId: "org-a",
			store: sourceStore,
		});

		expect(sourceStore.load).not.toHaveBeenCalled();
		expect(result).toMatchObject({ mode, access: "allowed", source: { kind: "legacy" } });
	});

	it("fails cloud closed when no billing projection exists", async () => {
		const result = await resolveOrganizationEntitlements({
			mode: "cloud",
			organizationId: "org-a",
			now,
			store: store(source({ subscription: null })),
		});

		expect(result).toMatchObject({ mode: "cloud", access: "denied", reason: "missing-subscription" });
	});

	it("resolves one projected source for request-time plan and add-on access", async () => {
		const sourceStore = store(source({ claudeAddonPromptSlots: 7 }));
		const result = await resolveOrganizationEntitlements({
			mode: "cloud",
			organizationId: "org-a",
			now,
			store: sourceStore,
		});

		expect(sourceStore.load).toHaveBeenCalledWith("org-a");
		expect(result).toMatchObject({
			access: "allowed",
			source: { kind: "catalog", planId: "pro" },
			entitlements: { brandSlots: 2, promptSlots: 150, claudeTracking: { totalPromptSlots: 27 } },
		});
	});
});

describe("resolveOrganizationEntitlementSource", () => {
	it("bounds active access and changes the source token at the stale boundary", () => {
		const currentPeriodEnd = new Date("2026-08-04T12:00:00.000Z");
		const snapshot = source({ subscription: { ...source().subscription!, currentPeriodEnd } });
		const deadline = new Date(currentPeriodEnd.getTime() + CLOUD_ACTIVE_SUBSCRIPTION_SYNC_GRACE_MS);
		const before = resolveOrganizationEntitlementSource(snapshot, new Date(deadline.getTime() - 1));
		const at = resolveOrganizationEntitlementSource(snapshot, deadline);

		expect(before.resolved.access).toBe("allowed");
		expect(before.lifecycleTransitionAt).toEqual(deadline);
		expect(at.resolved).toMatchObject({ access: "denied", reason: "stale-subscription" });
		expect(at.lifecycleDenialReason).toBe("stale-subscription");
		expect(at.lifecycleTransitionAt).toBeNull();
		expect(at.sourceToken).not.toBe(before.sourceToken);
	});

	it("allows past-due access inside seven days and denies it exactly at expiry", () => {
		const delinquentSince = new Date(now.getTime() - CLOUD_PAST_DUE_GRACE_MS + 1);
		const within = resolveOrganizationEntitlementSource(
			source({
				subscription: {
					...source().subscription!,
					status: "past_due",
					delinquentSince,
				},
			}),
			now,
		);
		expect(within.resolved.access).toBe("allowed");

		const at = resolveOrganizationEntitlementSource(
			source({
				subscription: {
					...source().subscription!,
					status: "past_due",
					delinquentSince: new Date(now.getTime() - CLOUD_PAST_DUE_GRACE_MS),
				},
			}),
			now,
		);
		expect(at.resolved).toMatchObject({ access: "denied", reason: "payment-grace-expired" });
	});

	it.each([
		{ status: "active", currentPeriodEnd: null, delinquentSince: null },
		{ status: "past_due", currentPeriodEnd: null, delinquentSince: null },
	])("denies $status when its lifecycle timestamp is missing", (subscription) => {
		const result = resolveOrganizationEntitlementSource(
			source({ subscription: { ...source().subscription!, ...subscription } }),
			now,
		);
		expect(result.resolved).toMatchObject({ access: "denied", reason: "invalid-subscription-lifecycle" });
	});

	it("changes identity when payment recovers and clears the lifecycle denial", () => {
		const pastDue = resolveOrganizationEntitlementSource(
			source({
				subscription: {
					...source().subscription!,
					status: "past_due",
					delinquentSince: new Date(now.getTime() - CLOUD_PAST_DUE_GRACE_MS),
				},
			}),
			now,
		);
		const recovered = resolveOrganizationEntitlementSource(source(), now);

		expect(pastDue.lifecycleDenialReason).toBe("payment-grace-expired");
		expect(recovered.resolved.access).toBe("allowed");
		expect(recovered.lifecycleDenialReason).toBeNull();
		expect(recovered.sourceToken).not.toBe(pastDue.sourceToken);
	});

	it("uses the earliest lifecycle or custom-contract boundary", () => {
		const customBoundary = new Date("2026-08-10T00:00:00.000Z");
		const result = resolveOrganizationEntitlementSource(
			source({
				entitlementRevisions: [
					{
						revision: 1,
						schemaVersion: 1,
						entitlements: {},
						effectiveFrom: customBoundary,
						effectiveUntil: null,
						revokedAt: null,
					},
				],
			}),
			now,
		);

		expect(result.customTransitionAt).toEqual(customBoundary);
		expect(result.nextTransitionAt).toEqual(customBoundary);
		expect(result.activeCustomRevision).toBeNull();
	});

	it("includes a pending mutation in both access and the deterministic token", () => {
		const baseline = resolveOrganizationEntitlementSource(source(), now);
		const pending = resolveOrganizationEntitlementSource(source({ pendingBillingMutationId: "mutation-1" }), now);

		expect(pending.resolved).toMatchObject({ access: "denied", reason: "billing-change-pending" });
		expect(pending.pendingBillingMutationId).toBe("mutation-1");
		expect(pending.sourceToken).not.toBe(baseline.sourceToken);
		expect(resolveOrganizationEntitlementSource(source(), now).sourceToken).toBe(baseline.sourceToken);
	});
});
