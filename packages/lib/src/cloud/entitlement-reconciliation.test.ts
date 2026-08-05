import { resolveEntitlements } from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import {
	assessOrganizationTrackingCapacity,
	nextOrganizationEntitlementTransitionAt,
	type OrganizationEntitlementSourceRevision,
} from "./entitlement-reconciliation";

const now = new Date("2026-09-15T00:00:00.000Z");

function revision(input: Partial<OrganizationEntitlementSourceRevision>): OrganizationEntitlementSourceRevision {
	return {
		revision: 1,
		schemaVersion: 1,
		entitlements: {},
		effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
		effectiveUntil: null,
		revokedAt: null,
		...input,
	};
}

describe("organization entitlement transition cursor", () => {
	it("wakes at an atomic custom replacement boundary", () => {
		const transitionAt = new Date("2026-10-01T00:00:00.000Z");
		expect(
			nextOrganizationEntitlementTransitionAt(
				[revision({ revokedAt: transitionAt }), revision({ revision: 2, effectiveFrom: transitionAt })],
				now,
			),
		).toEqual(transitionAt);
	});

	it("ignores a future revision canceled before it could become effective", () => {
		const future = new Date("2026-10-01T00:00:00.000Z");
		expect(
			nextOrganizationEntitlementTransitionAt(
				[revision({ effectiveFrom: future, revokedAt: new Date("2026-09-10T00:00:00.000Z") })],
				now,
			),
		).toBeNull();
	});
});

describe("organization tracking capacity transition", () => {
	const pro = resolveEntitlements({
		mode: "cloud",
		subscription: { planId: "pro", status: "active" },
	});

	it("fails the entire standard configuration closed instead of choosing first rows", () => {
		expect(
			assessOrganizationTrackingCapacity({
				resolved: pro,
				enabledBrands: 3,
				enabledPrompts: 151,
				premiumPromptAssignments: 0,
			}),
		).toEqual({ standardCapacityValid: false, premiumCapacityValid: true });
	});

	it("suspends all premium schedules when assignments exceed the resolved pool", () => {
		expect(
			assessOrganizationTrackingCapacity({
				resolved: pro,
				enabledBrands: 2,
				enabledPrompts: 150,
				premiumPromptAssignments: 21,
			}),
		).toEqual({ standardCapacityValid: true, premiumCapacityValid: false });
	});

	it("treats a pending or inactive billing source as wholly denied", () => {
		const denied = resolveEntitlements({
			mode: "cloud",
			subscription: { planId: "pro", status: "active", billingMutationPending: true },
		});
		expect(
			assessOrganizationTrackingCapacity({
				resolved: denied,
				enabledBrands: 0,
				enabledPrompts: 0,
				premiumPromptAssignments: 0,
			}),
		).toEqual({ standardCapacityValid: false, premiumCapacityValid: false });
	});
});
