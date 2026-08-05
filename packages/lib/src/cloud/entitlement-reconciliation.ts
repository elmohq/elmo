import { createHash } from "node:crypto";
import {
	type CloudSubscriptionEntitlementSnapshot,
	type ResolvedEntitlements,
	resolveEntitlements,
} from "@workspace/config/entitlements";
import { CLAUDE_NATIVE_WEB_TARGET_KEY } from "@workspace/config/plans";
import { and, count, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
	brandSchedulerRollouts,
	brands,
	organizationBillingSubscriptionItems,
	organizationBillingSubscriptions,
	organizationEntitlementOverrides,
	organizationEntitlementReconciliations,
	prompts,
	promptTargetAssignments,
	trackingSchedules,
} from "../db/schema";
import { lockOrganizationCapacity } from "./advisory-locks";
import { CapacityExceededError } from "./capacity";
import { TrackingSettingsError, reconcileBrandTrackingSettings } from "./tracking-settings";
import { resolveRuntimeTrackingPolicy } from "./tracking-policy";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AllowedCloudEntitlements = Extract<ResolvedEntitlements, { mode: "cloud"; access: "allowed" }>;

export interface OrganizationEntitlementSourceRevision {
	revision: number;
	schemaVersion: number;
	entitlements: Record<string, unknown>;
	effectiveFrom: Date;
	effectiveUntil: Date | null;
	revokedAt: Date | null;
}

function earlierDate(left: Date | null, right: Date | null): Date | null {
	if (left === null) return right;
	if (right === null) return left;
	return left < right ? left : right;
}

export function nextOrganizationEntitlementTransitionAt(
	revisions: readonly OrganizationEntitlementSourceRevision[],
	now: Date,
): Date | null {
	const candidates = revisions.flatMap((revision) => {
		const end = earlierDate(revision.effectiveUntil, revision.revokedAt);
		if (end !== null && end <= revision.effectiveFrom) return [];
		if (revision.effectiveFrom > now) return [revision.effectiveFrom];
		if (end !== null && end > now) return [end];
		return [];
	});
	return candidates.sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

function activeEntitlementRevision(
	revisions: readonly OrganizationEntitlementSourceRevision[],
	now: Date,
): OrganizationEntitlementSourceRevision | undefined {
	return revisions
		.filter(
			(revision) =>
				revision.effectiveFrom <= now &&
				(revision.revokedAt === null || revision.revokedAt > now) &&
				(revision.effectiveUntil === null || revision.effectiveUntil > now),
		)
		.sort((left, right) => right.revision - left.revision)[0];
}

async function loadOrganizationEntitlementResolution(input: {
	organizationId: string;
	now: Date;
	tx: DbTransaction;
}): Promise<{ resolved: ResolvedEntitlements; sourceToken: string; nextTransitionAt: Date | null }> {
	const [subscription] = await input.tx
		.select({
			stripeSubscriptionId: organizationBillingSubscriptions.stripeSubscriptionId,
			planId: organizationBillingSubscriptions.basePlanKey,
			status: organizationBillingSubscriptions.status,
		})
		.from(organizationBillingSubscriptions)
		.where(eq(organizationBillingSubscriptions.organizationId, input.organizationId))
		.limit(1);
	const [premiumItem] = await input.tx
		.select({ quantity: organizationBillingSubscriptionItems.quantity })
		.from(organizationBillingSubscriptionItems)
		.where(
			and(
				eq(organizationBillingSubscriptionItems.organizationId, input.organizationId),
				eq(organizationBillingSubscriptionItems.type, "premium_addon"),
				eq(organizationBillingSubscriptionItems.active, true),
			),
		)
		.limit(1);
	const revisions = await input.tx
		.select({
			revision: organizationEntitlementOverrides.revision,
			schemaVersion: organizationEntitlementOverrides.schemaVersion,
			entitlements: organizationEntitlementOverrides.entitlements,
			effectiveFrom: organizationEntitlementOverrides.effectiveFrom,
			effectiveUntil: organizationEntitlementOverrides.effectiveUntil,
			revokedAt: organizationEntitlementOverrides.revokedAt,
		})
		.from(organizationEntitlementOverrides)
		.where(eq(organizationEntitlementOverrides.organizationId, input.organizationId));
	const override = activeEntitlementRevision(revisions, input.now);
	const claudeAddonPromptSlots = premiumItem?.quantity ?? 0;
	const snapshot: CloudSubscriptionEntitlementSnapshot | null = subscription?.planId
		? {
				planId: subscription.planId,
				status: subscription.status,
				claudeAddonPromptSlots,
				entitlementOverride: override
					? { version: override.schemaVersion, entitlements: override.entitlements }
					: undefined,
			}
		: null;
	const sourceToken = createHash("sha256")
		.update(
			JSON.stringify({
				version: 1,
				subscription: subscription
					? {
							stripeSubscriptionId: subscription.stripeSubscriptionId,
							status: subscription.status,
							basePlanKey: subscription.planId,
						}
					: null,
				claudeAddonPromptSlots,
				override: override ? { revision: override.revision, schemaVersion: override.schemaVersion } : null,
			}),
		)
		.digest("hex");
	return {
		resolved: resolveEntitlements({ mode: "cloud", subscription: snapshot }),
		sourceToken,
		nextTransitionAt: nextOrganizationEntitlementTransitionAt(revisions, input.now),
	};
}

export type OrganizationTrackingEntitlementReconciliationResult = {
	organizationId: string;
	sourceToken: string;
	sourceChanged: boolean;
	outcome: "denied" | "configuration-over-capacity" | "reconciled";
	invalidBrandIds: string[];
	premiumSchedulesSuspended: boolean;
	nextTransitionAt: Date | null;
};

export function assessOrganizationTrackingCapacity(input: {
	resolved: ResolvedEntitlements;
	enabledBrands: number;
	enabledPrompts: number;
	premiumPromptAssignments: number;
}): {
	standardCapacityValid: boolean;
	premiumCapacityValid: boolean;
} {
	if (input.resolved.mode !== "cloud" || input.resolved.access !== "allowed") {
		return { standardCapacityValid: false, premiumCapacityValid: false };
	}
	const entitlements = input.resolved.entitlements;
	return {
		standardCapacityValid:
			input.enabledBrands <= entitlements.brandSlots && input.enabledPrompts <= entitlements.promptSlots,
		premiumCapacityValid:
			entitlements.claudeTracking.enabled &&
			input.premiumPromptAssignments <= entitlements.claudeTracking.totalPromptSlots,
	};
}

function isExpectedConfigurationError(error: unknown): boolean {
	return error instanceof TrackingSettingsError || error instanceof CapacityExceededError;
}

async function deactivateAllSchedules(tx: DbTransaction, brandIds: readonly string[], now: Date): Promise<void> {
	if (brandIds.length === 0) return;
	await tx
		.update(trackingSchedules)
		.set({ active: false, updatedAt: now })
		.where(inArray(trackingSchedules.brandId, [...brandIds]));
}

async function deactivateManagedSchedules(
	tx: DbTransaction,
	brandIds: readonly string[],
	now: Date,
	source?: "premium",
): Promise<void> {
	if (brandIds.length === 0) return;
	await tx.execute(sql`
		UPDATE tracking_schedules schedule
		SET active = false, updated_at = ${now}
		FROM prompt_target_assignments assignment
		WHERE schedule.prompt_target_assignment_id = assignment.id
			AND schedule.brand_id IN (${sql.join(
				brandIds.map((brandId) => sql`${brandId}`),
				sql`, `,
			)})
			AND ${source ? sql`assignment.source = ${source}` : sql`assignment.source <> 'custom'`}
	`);
}

async function loadOrganizationCapacityState(
	tx: DbTransaction,
	organizationId: string,
): Promise<{
	enabledBrands: number;
	enabledPrompts: number;
	premiumPromptAssignments: number;
}> {
	const [{ value: enabledBrands = 0 } = { value: 0 }] = await tx
		.select({ value: count() })
		.from(brands)
		.where(and(eq(brands.organizationId, organizationId), eq(brands.enabled, true)));
	const [{ value: enabledPrompts = 0 } = { value: 0 }] = await tx
		.select({ value: count() })
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.enabled, true)));
	const [{ value: premiumPromptAssignments = 0 } = { value: 0 }] = await tx
		.select({ value: count() })
		.from(promptTargetAssignments)
		.innerJoin(prompts, eq(prompts.id, promptTargetAssignments.promptId))
		.innerJoin(brands, eq(brands.id, promptTargetAssignments.brandId))
		.where(
			and(
				eq(brands.organizationId, organizationId),
				eq(promptTargetAssignments.source, "premium"),
				eq(promptTargetAssignments.targetKey, CLAUDE_NATIVE_WEB_TARGET_KEY),
				eq(promptTargetAssignments.enabled, true),
				eq(prompts.enabled, true),
			),
		);
	return { enabledBrands, enabledPrompts, premiumPromptAssignments };
}

async function reconcileCustomSchedules(input: {
	tx: DbTransaction;
	resolved: AllowedCloudEntitlements;
	brandId: string;
	generation: number;
	now: Date;
}): Promise<void> {
	const schedules = await input.tx
		.select({
			id: trackingSchedules.id,
			targetKey: trackingSchedules.targetKey,
			cadenceMinutes: trackingSchedules.cadenceMinutes,
			samplesPerOccurrence: trackingSchedules.samplesPerOccurrence,
			active: trackingSchedules.active,
			nextDueAt: trackingSchedules.nextDueAt,
			generation: trackingSchedules.generation,
			policyVersion: trackingSchedules.policyVersion,
			assignmentEnabled: promptTargetAssignments.enabled,
			promptEnabled: prompts.enabled,
		})
		.from(trackingSchedules)
		.innerJoin(promptTargetAssignments, eq(promptTargetAssignments.id, trackingSchedules.promptTargetAssignmentId))
		.innerJoin(prompts, eq(prompts.id, trackingSchedules.promptId))
		.where(and(eq(trackingSchedules.brandId, input.brandId), eq(promptTargetAssignments.source, "custom")));
	for (const schedule of schedules) {
		const permitted =
			schedule.assignmentEnabled &&
			schedule.promptEnabled &&
			resolveRuntimeTrackingPolicy({
				resolved: input.resolved,
				assignmentSource: "custom",
				targetKey: schedule.targetKey,
				cadenceMinutes: schedule.cadenceMinutes,
				samplesPerOccurrence: schedule.samplesPerOccurrence,
			}) !== null;
		if (!permitted) {
			if (schedule.active) {
				await input.tx
					.update(trackingSchedules)
					.set({ active: false, updatedAt: input.now })
					.where(eq(trackingSchedules.id, schedule.id));
			}
			continue;
		}
		const policyChanged = !schedule.active || schedule.generation !== input.generation;
		await input.tx
			.update(trackingSchedules)
			.set({
				active: true,
				generation: input.generation,
				policyVersion: policyChanged ? schedule.policyVersion + 1 : schedule.policyVersion,
				nextDueAt: policyChanged ? input.now : (schedule.nextDueAt ?? input.now),
				updatedAt: input.now,
			})
			.where(eq(trackingSchedules.id, schedule.id));
	}
}

async function finishReconciliationCursor(input: {
	tx: DbTransaction;
	organizationId: string;
	sourceToken: string;
	nextTransitionAt: Date | null;
	now: Date;
}): Promise<void> {
	await input.tx
		.insert(organizationEntitlementReconciliations)
		.values({
			organizationId: input.organizationId,
			appliedSourceToken: input.sourceToken,
			reconcileAfter: input.nextTransitionAt,
			lastReconciledAt: input.now,
		})
		.onConflictDoUpdate({
			target: organizationEntitlementReconciliations.organizationId,
			set: {
				appliedSourceToken: input.sourceToken,
				reconcileAfter: input.nextTransitionAt,
				lastReconciledAt: input.now,
				updatedAt: input.now,
			},
		});
}

/**
 * Rebuilds every explicit v2 brand from one authoritative entitlement view.
 * Expected downgrade conflicts fail closed while preserving selections and
 * assignments so an operator or workspace owner can remediate them.
 */
export async function reconcileOrganizationTrackingEntitlementsInTransaction(input: {
	tx: DbTransaction;
	organizationId: string;
	now?: Date;
}): Promise<OrganizationTrackingEntitlementReconciliationResult> {
	const now = input.now ?? new Date();
	await lockOrganizationCapacity(input.tx, input.organizationId);
	await input.tx
		.insert(organizationEntitlementReconciliations)
		.values({ organizationId: input.organizationId, reconcileAfter: now })
		.onConflictDoNothing({ target: organizationEntitlementReconciliations.organizationId });
	const [cursor] = await input.tx
		.select({ appliedSourceToken: organizationEntitlementReconciliations.appliedSourceToken })
		.from(organizationEntitlementReconciliations)
		.where(eq(organizationEntitlementReconciliations.organizationId, input.organizationId))
		.limit(1);
	const resolution = await loadOrganizationEntitlementResolution({
		organizationId: input.organizationId,
		now,
		tx: input.tx,
	});
	const rolloutBrands = await input.tx
		.select({ id: brands.id, generation: brandSchedulerRollouts.generation })
		.from(brands)
		.innerJoin(brandSchedulerRollouts, eq(brandSchedulerRollouts.brandId, brands.id))
		.where(and(eq(brands.organizationId, input.organizationId), eq(brandSchedulerRollouts.mode, "v2")));
	const brandIds = rolloutBrands.map((brand) => brand.id);
	const sourceChanged = cursor?.appliedSourceToken !== resolution.sourceToken;
	if (sourceChanged && brandIds.length > 0) {
		// Fence occurrences reserved under the previous contract even when the
		// resulting cadence happens to be identical on both plans.
		await input.tx
			.update(brandSchedulerRollouts)
			.set({
				generation: sql`${brandSchedulerRollouts.generation} + 1`,
				updatedAt: now,
			})
			.where(and(inArray(brandSchedulerRollouts.brandId, brandIds), eq(brandSchedulerRollouts.mode, "v2")));
	}
	const result: OrganizationTrackingEntitlementReconciliationResult = {
		organizationId: input.organizationId,
		sourceToken: resolution.sourceToken,
		sourceChanged,
		outcome: "reconciled",
		invalidBrandIds: [],
		premiumSchedulesSuspended: false,
		nextTransitionAt: resolution.nextTransitionAt,
	};

	if (resolution.resolved.mode !== "cloud" || resolution.resolved.access !== "allowed") {
		await deactivateAllSchedules(input.tx, brandIds, now);
		result.outcome = "denied";
	} else {
		const capacity = assessOrganizationTrackingCapacity({
			resolved: resolution.resolved,
			...(await loadOrganizationCapacityState(input.tx, input.organizationId)),
		});
		if (!capacity.standardCapacityValid) {
			// Running a first-N subset would make downgrade behavior depend on row
			// order. Stop the organization instead and preserve its configuration.
			await deactivateAllSchedules(input.tx, brandIds, now);
			result.outcome = "configuration-over-capacity";
		} else {
			for (const { id: brandId, generation } of rolloutBrands) {
				try {
					await reconcileBrandTrackingSettings({
						tx: input.tx,
						resolved: resolution.resolved as AllowedCloudEntitlements,
						organizationId: input.organizationId,
						brandId,
						now,
					});
				} catch (error) {
					if (!isExpectedConfigurationError(error)) throw error;
					await deactivateManagedSchedules(input.tx, [brandId], now);
					result.invalidBrandIds.push(brandId);
				}
				await reconcileCustomSchedules({
					tx: input.tx,
					resolved: resolution.resolved as AllowedCloudEntitlements,
					brandId,
					generation: generation + (sourceChanged ? 1 : 0),
					now,
				});
			}
			if (!capacity.premiumCapacityValid) {
				// Never choose an arbitrary subset of premium prompts after a plan or
				// add-on reduction. The user's durable assignments remain editable.
				await deactivateManagedSchedules(input.tx, brandIds, now, "premium");
				result.premiumSchedulesSuspended = true;
			}
		}
	}

	await finishReconciliationCursor({
		tx: input.tx,
		organizationId: input.organizationId,
		sourceToken: resolution.sourceToken,
		nextTransitionAt: resolution.nextTransitionAt,
		now,
	});
	return result;
}

export async function reconcileOrganizationTrackingEntitlements(input: {
	organizationId: string;
	now?: Date;
}): Promise<OrganizationTrackingEntitlementReconciliationResult> {
	return db.transaction((tx) => reconcileOrganizationTrackingEntitlementsInTransaction({ ...input, tx }));
}

/** Reconciles only durable cursors whose source or contract boundary is due. */
export async function reconcileDueOrganizationTrackingEntitlements(
	input: { now?: Date; limit?: number } = {},
): Promise<OrganizationTrackingEntitlementReconciliationResult[]> {
	const now = input.now ?? new Date();
	const limit = input.limit ?? 50;
	if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Reconciliation limit must be a positive integer");
	const due = await db
		.select({ organizationId: organizationEntitlementReconciliations.organizationId })
		.from(organizationEntitlementReconciliations)
		.where(lte(organizationEntitlementReconciliations.reconcileAfter, now))
		.orderBy(organizationEntitlementReconciliations.reconcileAfter)
		.limit(limit);
	const results: OrganizationTrackingEntitlementReconciliationResult[] = [];
	const errors: unknown[] = [];
	for (const cursor of due) {
		try {
			const result = await db.transaction(async (tx) => {
				await lockOrganizationCapacity(tx, cursor.organizationId);
				const [current] = await tx
					.select({ reconcileAfter: organizationEntitlementReconciliations.reconcileAfter })
					.from(organizationEntitlementReconciliations)
					.where(eq(organizationEntitlementReconciliations.organizationId, cursor.organizationId))
					.limit(1);
				if (!current?.reconcileAfter || current.reconcileAfter > now) return null;
				return reconcileOrganizationTrackingEntitlementsInTransaction({
					tx,
					organizationId: cursor.organizationId,
					now,
				});
			});
			if (result) results.push(result);
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) throw new AggregateError(errors, `${errors.length} entitlement reconciliation(s) failed`);
	return results;
}
