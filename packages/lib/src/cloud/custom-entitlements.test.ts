import { describe, expect, it } from "vitest";
import {
	type CustomEntitlementOperatorError,
	currentEntitlementRevision,
	type EntitlementOverrideRevision,
	type EntitlementOverrideStore,
	effectiveWindowsOverlap,
	entitlementRevisionWindow,
	planEntitlementOverrideAppend,
	planEntitlementOverrideReplacement,
	planEntitlementOverrideRevocation,
	previewEntitlementOverrideAppend,
	replaceEntitlementOverride,
} from "./custom-entitlements";

const payload = {
	version: 1 as const,
	entitlements: {
		brandSlots: 3,
		promptSlots: 200,
		trackingTargets: {
			mode: "configurable" as const,
			minimumSelected: 1,
			maximumSelected: 1,
			targets: [
				{
					targetKey: "chatgpt",
					schedule: {
						cadenceMinutes: 360,
						samplesPerEvaluation: 1,
						cadencePolicy: {
							mode: "configurable" as const,
							minimumCadenceMinutes: 206,
							maximumCadenceMinutes: 1440,
						},
					},
				},
			],
		},
		claudeTracking: {
			enabled: false as const,
			allowedModes: [],
			includedPromptSlots: 0 as const,
			addon: { enabled: false as const, maximumAdditionalPromptSlots: 0 as const },
			schedule: null,
		},
	},
};

const start = new Date("2026-09-01T00:00:00.000Z");
const end = new Date("2026-10-01T00:00:00.000Z");

function revision(input: Partial<EntitlementOverrideRevision> = {}): EntitlementOverrideRevision {
	return {
		id: "override-1",
		organizationId: "org-1",
		revision: 1,
		payload,
		effectiveFrom: start,
		effectiveUntil: end,
		revokedAt: null,
		reason: "Initial custom agreement",
		createdByUserId: "operator-1",
		createdAt: new Date("2026-08-15T00:00:00.000Z"),
		...input,
	};
}

function appendInput(existing: EntitlementOverrideRevision[] = []) {
	return {
		organizationId: "org-1",
		actorUserId: "operator-1",
		reason: "Signed renewal",
		payload,
		effectiveFrom: start,
		effectiveUntil: end,
		expectedLatestRevision: existing.length ? Math.max(...existing.map((item) => item.revision)) : 0,
		existing,
	};
}

describe("custom entitlement decisions", () => {
	it("treats effective windows as half-open intervals", () => {
		expect(
			effectiveWindowsOverlap(
				{ effectiveFrom: start, effectiveUntil: end },
				{ effectiveFrom: end, effectiveUntil: null },
			),
		).toBe(false);
		expect(
			effectiveWindowsOverlap(
				{ effectiveFrom: start, effectiveUntil: null },
				{ effectiveFrom: end, effectiveUntil: null },
			),
		).toBe(true);
	});

	it("accepts adjacent future contract windows and allocates the next revision", () => {
		const existing = [revision()];
		const draft = planEntitlementOverrideAppend({
			...appendInput(existing),
			effectiveFrom: end,
			effectiveUntil: new Date("2027-01-01T00:00:00.000Z"),
		});

		expect(draft).toMatchObject({ revision: 2, organizationId: "org-1", createdByUserId: "operator-1" });
	});

	it("rejects invalid contracts, empty audit metadata, and overlapping windows", () => {
		expect(() => planEntitlementOverrideAppend({ ...appendInput(), payload: { version: 1 } })).toThrow(
			/Invalid custom entitlement payload/,
		);
		expect(() => planEntitlementOverrideAppend({ ...appendInput(), reason: "  " })).toThrow(/Reason must not be empty/);
		expect(() => planEntitlementOverrideAppend({ ...appendInput(), actorUserId: "" })).toThrow(
			/Actor user ID must not be empty/,
		);
		expect(() => planEntitlementOverrideAppend(appendInput([revision()]))).toThrowError(
			expect.objectContaining({ code: "effective-window-overlap" }),
		);
	});

	it("rejects a stale revision expectation", () => {
		expect(() =>
			planEntitlementOverrideAppend({ ...appendInput([revision({ revision: 3 })]), expectedLatestRevision: 2 }),
		).toThrowError(expect.objectContaining({ code: "revision-conflict" }));
	});

	it("selects the greatest currently effective non-revoked revision", () => {
		const at = new Date("2026-09-15T00:00:00.000Z");
		expect(
			currentEntitlementRevision(
				[
					revision(),
					revision({ id: "override-2", revision: 2 }),
					revision({ id: "override-3", revision: 3, revokedAt: at }),
				],
				at,
			)?.revision,
		).toBe(2);
	});

	it("replaces an active open-ended contract immediately without a gap", () => {
		const now = new Date("2026-09-15T00:00:00.000Z");
		const original = revision({ effectiveUntil: null });
		const plan = planEntitlementOverrideReplacement({
			organizationId: "org-1",
			actorUserId: "operator-2",
			reason: "Expanded signed agreement",
			predecessorRevision: 1,
			payload,
			now,
			transitionAt: now,
			expectedLatestRevision: 1,
			existing: [original],
		});
		const predecessor = { ...original, revokedAt: plan.transitionAt };
		const successor = revision({
			id: "override-2",
			revision: plan.successor.revision,
			payload: plan.successor.payload,
			effectiveFrom: plan.successor.effectiveFrom,
			effectiveUntil: plan.successor.effectiveUntil,
			revokedAt: null,
			reason: plan.successor.reason,
			createdByUserId: plan.successor.createdByUserId,
		});

		expect(currentEntitlementRevision([predecessor, successor], new Date(now.getTime() - 1))?.revision).toBe(1);
		expect(currentEntitlementRevision([predecessor, successor], now)?.revision).toBe(2);
		expect(plan.successor.reason).toBe("replace:predecessor=1; Expanded signed agreement");
		expect(plan.target.payload).toBe(original.payload);
		expect(plan.successor.payload).toStrictEqual(payload);
	});

	it("applies the predecessor end and successor insert under one organization lock", async () => {
		const now = new Date("2026-09-15T00:00:00.000Z");
		let lockCount = 0;
		const revisions = [revision({ effectiveUntil: null })];
		const store: EntitlementOverrideStore = {
			withOrganizationLock: async (_organizationId, run) => {
				lockCount++;
				return run({
					organizationExists: async () => true,
					organizationUsesCustomPlan: async () => true,
					actorExists: async () => true,
					list: async () => [...revisions],
					insert: async (draft) => {
						const inserted = revision({ id: "override-2", createdAt: now, ...draft });
						revisions.push(inserted);
						return inserted;
					},
					setRevocationIfUnscheduled: async ({ revision: targetRevision, revokedAt }) => {
						const index = revisions.findIndex((item) => item.revision === targetRevision && item.revokedAt === null);
						if (index < 0 || !revisions[index]) return false;
						revisions[index] = { ...revisions[index], revokedAt };
						return true;
					},
					rescheduleRevocationIfMatches: async () => false,
				});
			},
		};

		const applied = await replaceEntitlementOverride(
			{
				organizationId: "org-1",
				actorUserId: "operator-2",
				reason: "Immediate upgrade",
				predecessorRevision: 1,
				payload,
				now,
				transitionAt: now,
				expectedLatestRevision: 1,
			},
			store,
		);

		expect(lockCount).toBe(1);
		expect(applied).toMatchObject({ endedRevision: 1, successor: { revision: 2 }, transitionAt: now });
		expect(currentEntitlementRevision(revisions, now)?.revision).toBe(2);
	});

	it("keeps the predecessor active until a scheduled replacement boundary", () => {
		const now = new Date("2026-09-15T00:00:00.000Z");
		const transitionAt = new Date("2026-10-15T00:00:00.000Z");
		const original = revision({ effectiveUntil: null });
		const plan = planEntitlementOverrideReplacement({
			organizationId: "org-1",
			actorUserId: "operator-2",
			reason: "Renewal",
			predecessorRevision: 1,
			payload,
			now,
			transitionAt,
			expectedLatestRevision: 1,
			existing: [original],
		});
		const predecessor = { ...original, revokedAt: transitionAt };
		const successor = revision({
			id: "override-2",
			revision: 2,
			effectiveFrom: transitionAt,
			effectiveUntil: null,
			reason: plan.successor.reason,
		});
		const predecessorWindow = entitlementRevisionWindow(predecessor);
		const successorWindow = entitlementRevisionWindow(successor);

		expect(currentEntitlementRevision([predecessor, successor], now)?.revision).toBe(1);
		expect(currentEntitlementRevision([predecessor, successor], new Date(transitionAt.getTime() - 1))?.revision).toBe(
			1,
		);
		expect(currentEntitlementRevision([predecessor, successor], transitionAt)?.revision).toBe(2);
		expect(predecessorWindow && successorWindow && effectiveWindowsOverlap(predecessorWindow, successorWindow)).toBe(
			false,
		);
	});

	it("cancels a future replacement and restores its predecessor", () => {
		const now = new Date("2026-09-20T00:00:00.000Z");
		const transitionAt = new Date("2026-10-15T00:00:00.000Z");
		const predecessor = revision({ effectiveUntil: null, revokedAt: transitionAt });
		const successor = revision({
			id: "override-2",
			revision: 2,
			effectiveFrom: transitionAt,
			effectiveUntil: null,
			reason: "replace:predecessor=1; Mistaken renewal",
		});
		const plan = planEntitlementOverrideRevocation({
			organizationId: "org-1",
			actorUserId: "operator-2",
			reason: "Customer corrected the contract",
			revision: 2,
			now,
			expectedLatestRevision: 2,
			existing: [predecessor, successor],
		});

		expect(plan.restorePredecessor).toEqual({
			revision: 1,
			expectedRevokedAt: transitionAt,
			revokedAt: null,
		});
		expect(plan.audit.reason).toBe("cancel:revision=2;restore-predecessor=1; Customer corrected the contract");
		expect(plan.target.payload).toBe(successor.payload);
		const restored = { ...predecessor, revokedAt: null };
		const canceled = { ...successor, revokedAt: now };
		expect(currentEntitlementRevision([restored, canceled], transitionAt)?.revision).toBe(1);
	});

	it("rejects a stale expected revision for replacement", () => {
		expect(() =>
			planEntitlementOverrideReplacement({
				organizationId: "org-1",
				actorUserId: "operator-2",
				reason: "Renewal",
				predecessorRevision: 1,
				payload,
				now: new Date("2026-09-15T00:00:00.000Z"),
				transitionAt: new Date("2026-09-15T00:00:00.000Z"),
				expectedLatestRevision: 0,
				existing: [revision({ effectiveUntil: null })],
			}),
		).toThrowError(expect.objectContaining({ code: "revision-conflict" }));
	});

	it("revokes only an active revision and appends immutable audit metadata", () => {
		const original = revision({ effectiveUntil: null });
		const now = new Date("2026-09-15T00:00:00.000Z");
		const plan = planEntitlementOverrideRevocation({
			organizationId: "org-1",
			actorUserId: "operator-2",
			reason: "Contract terminated",
			revision: 1,
			now,
			expectedLatestRevision: 1,
			existing: [original],
		});

		expect(plan.target.payload).toBe(original.payload);
		expect(plan.audit).toMatchObject({
			revision: 2,
			payload: original.payload,
			revokedAt: now,
			createdByUserId: "operator-2",
			reason: "revoke:revision=1; Contract terminated",
		});
		expect(plan.action).toBe("revoke");
		expect(plan.restorePredecessor).toBeNull();
		expect(() =>
			planEntitlementOverrideRevocation({
				organizationId: "org-1",
				actorUserId: "operator-2",
				reason: "No longer valid",
				revision: 1,
				now: new Date("2027-01-01T00:00:00.000Z"),
				expectedLatestRevision: 1,
				existing: [revision()],
			}),
		).toThrowError(expect.objectContaining({ code: "revision-not-active" }));
		expect(() =>
			planEntitlementOverrideRevocation({
				organizationId: "org-1",
				actorUserId: "operator-2",
				reason: "Duplicate cancellation",
				revision: 1,
				now,
				expectedLatestRevision: 1,
				existing: [revision({ effectiveUntil: null, revokedAt: new Date("2026-09-10T00:00:00.000Z") })],
			}),
		).toThrowError(expect.objectContaining({ code: "revision-not-active" }));
	});

	it("rejects missing organizations through the injected store boundary", async () => {
		const store: EntitlementOverrideStore = {
			withOrganizationLock: async (_organizationId, run) =>
				run({
					organizationExists: async () => false,
					organizationUsesCustomPlan: async () => true,
					actorExists: async () => true,
					list: async () => [],
					insert: async () => {
						throw new Error("not reached");
					},
					setRevocationIfUnscheduled: async () => false,
					rescheduleRevocationIfMatches: async () => false,
				}),
		};

		await expect(
			previewEntitlementOverrideAppend(
				{
					organizationId: "missing-org",
					actorUserId: "operator-1",
					reason: "New contract",
					payload,
					effectiveFrom: start,
					effectiveUntil: end,
				},
				store,
			),
		).rejects.toEqual(
			expect.objectContaining<Partial<CustomEntitlementOperatorError>>({ code: "organization-not-found" }),
		);
	});
});
