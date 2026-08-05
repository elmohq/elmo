import { resolveEntitlements } from "@workspace/config/entitlements";
import { describe, expect, it } from "vitest";
import { brandSchedulerRollouts, trackingSchedules } from "../db/schema";
import {
	assessOrganizationTrackingCapacity,
	nextOrganizationEntitlementTransitionAt,
	reconcileOrganizationTrackingEntitlementsInTransaction,
	type OrganizationEntitlementSourceRevision,
} from "./entitlement-reconciliation";
import {
	type OrganizationEntitlementSourceSnapshot,
	resolveOrganizationEntitlementSource,
} from "./entitlements";

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
		subscription: {
			planId: "pro",
			status: "active",
			currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
			delinquentSince: null,
		},
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

	it("denies capacity while a billing mutation is pending and restores it after completion", () => {
		const pending = resolveEntitlements({
			mode: "cloud",
			subscription: {
				planId: "pro",
				status: "active",
				currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
				delinquentSince: null,
				billingMutationPending: true,
			},
		});
		expect(
			assessOrganizationTrackingCapacity({
				resolved: pending,
				enabledBrands: 0,
				enabledPrompts: 0,
				premiumPromptAssignments: 0,
			}),
		).toEqual({ standardCapacityValid: false, premiumCapacityValid: false });

		const completed = resolveEntitlements({
			mode: "cloud",
			subscription: {
				planId: "pro",
				status: "active",
				currentPeriodEnd: new Date("2099-01-01T00:00:00Z"),
				delinquentSince: null,
			},
		});
		expect(
			assessOrganizationTrackingCapacity({
				resolved: completed,
				enabledBrands: 0,
				enabledPrompts: 0,
				premiumPromptAssignments: 0,
			}),
		).toEqual({ standardCapacityValid: true, premiumCapacityValid: true });
	});
});

function queryBuilder(result: unknown) {
	const builder: Record<string, unknown> = {};
	for (const method of ["from", "where", "innerJoin", "leftJoin", "orderBy", "values"]) {
		builder[method] = () => builder;
	}
	builder.limit = async () => result;
	builder.onConflictDoNothing = async () => result;
	builder.onConflictDoUpdate = async () => result;
	builder.then = (
		resolve: (value: unknown) => unknown,
		reject: (reason: unknown) => unknown,
	) => Promise.resolve(result).then(resolve, reject);
	return builder;
}

describe("organization lifecycle schedule reconciliation", () => {
	it("deactivates schedules and advances generation exactly when lifecycle access expires", async () => {
		const expiresAt = new Date("2026-09-15T00:00:00.000Z");
		const source: OrganizationEntitlementSourceSnapshot = {
			subscription: {
				stripeSubscriptionId: "sub_1",
				planId: "pro",
				status: "active",
				currentPeriodEnd: new Date("2026-09-14T00:00:00.000Z"),
				delinquentSince: null,
			},
			claudeAddonPromptSlots: 0,
			pendingBillingMutationId: null,
			entitlementRevisions: [],
		};
		const priorToken = resolveOrganizationEntitlementSource(source, new Date(expiresAt.getTime() - 1)).sourceToken;
		const selectResults = [
			[{ appliedSourceToken: priorToken }],
			[source.subscription],
			[],
			[],
			[],
			[{ id: "brand-1", generation: 4 }],
		];
		const updates: Array<{ target: unknown; values: Record<string, unknown> }> = [];
		const tx = {
			execute: async () => ({ rows: [] }),
			select: () => queryBuilder(selectResults.shift() ?? []),
			insert: () => queryBuilder([]),
			update: (target: unknown) => {
				const builder = queryBuilder([]);
				builder.set = (values: Record<string, unknown>) => {
					updates.push({ target, values });
					return builder;
				};
				return builder;
			},
		} as unknown as Parameters<typeof reconcileOrganizationTrackingEntitlementsInTransaction>[0]["tx"];

		const result = await reconcileOrganizationTrackingEntitlementsInTransaction({
			tx,
			organizationId: "org-1",
			now: expiresAt,
		});

		expect(result).toMatchObject({ outcome: "denied", sourceChanged: true, nextTransitionAt: null });
		expect(updates).toContainEqual({
			target: trackingSchedules,
			values: { active: false, updatedAt: expiresAt },
		});
		expect(updates.some((update) => update.target === brandSchedulerRollouts)).toBe(true);
	});
});
