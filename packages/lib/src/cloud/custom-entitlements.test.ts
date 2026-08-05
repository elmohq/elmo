import { describe, expect, it } from "vitest";
import {
	type CustomEntitlementOperatorError,
	currentEntitlementRevision,
	type EntitlementOverrideRevision,
	type EntitlementOverrideStore,
	effectiveWindowsOverlap,
	planEntitlementOverrideAppend,
	planEntitlementOverrideRevocation,
	previewEntitlementOverrideAppend,
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
			reason: "Revoked revision 1: Contract terminated",
		});
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
					revokeIfActive: async () => false,
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
