import type { DeploymentMode } from "@workspace/config/types";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { brandSchedulerRollouts, brands, trackingSchedules } from "../db/schema";
import { lockOrganizationCapacity } from "./advisory-locks";
import { markOrganizationEntitlementReconciliationDue } from "./entitlement-reconciliation-cursor";

export class TrackingRolloutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TrackingRolloutError";
	}
}

function normalizedBrandIds(brandIds: readonly string[]): string[] {
	const unique = [...new Set(brandIds.map((brandId) => brandId.trim()))];
	if (unique.length === 0 || unique.some((brandId) => !brandId) || unique.length !== brandIds.length) {
		throw new TrackingRolloutError("Rollback brand IDs must be unique, non-empty, and explicit.");
	}
	return unique;
}

/**
 * Fail-closed rollback for a cloud v2 brand. The empty legacy projection keeps
 * this safe even if an older worker interprets the new paused enum as legacy.
 */
export async function pauseCloudTrackingRollouts(input: {
	mode: DeploymentMode;
	organizationId: string;
	brandIds: readonly string[];
	now?: Date;
}): Promise<Array<{ brandId: string; generation: number }>> {
	if (input.mode !== "cloud") throw new TrackingRolloutError("Only cloud v2 brands can be paused.");
	const brandIds = normalizedBrandIds(input.brandIds);
	const now = input.now ?? new Date();
	return db.transaction(async (tx) => {
		await lockOrganizationCapacity(tx, input.organizationId);
		const eligible = await tx
			.select({ brandId: brands.id })
			.from(brands)
			.innerJoin(brandSchedulerRollouts, eq(brandSchedulerRollouts.brandId, brands.id))
			.where(
				and(
					eq(brands.organizationId, input.organizationId),
					inArray(brands.id, brandIds),
					eq(brandSchedulerRollouts.mode, "v2"),
				),
			);
		if (eligible.length !== brandIds.length) {
			throw new TrackingRolloutError("Every requested brand must belong to the organization and be in v2 mode.");
		}

		// Old cloud workers select their provider set from enabled_models. An
		// explicit empty projection makes a downgrade safe across worker versions.
		await tx.update(brands).set({ enabledModels: [], updatedAt: now }).where(inArray(brands.id, brandIds));
		const paused = await tx
			.update(brandSchedulerRollouts)
			.set({
				mode: "paused",
				generation: sql`${brandSchedulerRollouts.generation} + 1`,
				lastRolledBackAt: now,
				updatedAt: now,
			})
			.where(inArray(brandSchedulerRollouts.brandId, brandIds))
			.returning({ brandId: brandSchedulerRollouts.brandId, generation: brandSchedulerRollouts.generation });
		await tx
			.update(trackingSchedules)
			.set({ active: false, updatedAt: now })
			.where(inArray(trackingSchedules.brandId, brandIds));
		return paused;
	});
}

export async function resumeCloudTrackingRollouts(input: {
	mode: DeploymentMode;
	organizationId: string;
	brandIds: readonly string[];
	now?: Date;
}): Promise<Array<{ brandId: string; generation: number }>> {
	if (input.mode !== "cloud") throw new TrackingRolloutError("Only cloud v2 brands can be resumed.");
	const brandIds = normalizedBrandIds(input.brandIds);
	const now = input.now ?? new Date();
	return db.transaction(async (tx) => {
		await lockOrganizationCapacity(tx, input.organizationId);
		const eligible = await tx
			.select({ brandId: brands.id })
			.from(brands)
			.innerJoin(brandSchedulerRollouts, eq(brandSchedulerRollouts.brandId, brands.id))
			.where(
				and(
					eq(brands.organizationId, input.organizationId),
					inArray(brands.id, brandIds),
					eq(brandSchedulerRollouts.mode, "paused"),
				),
			);
		if (eligible.length !== brandIds.length) {
			throw new TrackingRolloutError("Every requested brand must belong to the organization and be paused.");
		}
		const resumed = await tx
			.update(brandSchedulerRollouts)
			.set({
				mode: "v2",
				generation: sql`${brandSchedulerRollouts.generation} + 1`,
				cutoverAt: now,
				updatedAt: now,
			})
			.where(inArray(brandSchedulerRollouts.brandId, brandIds))
			.returning({ brandId: brandSchedulerRollouts.brandId, generation: brandSchedulerRollouts.generation });
		await markOrganizationEntitlementReconciliationDue({
			tx,
			organizationId: input.organizationId,
			reconcileAfter: now,
		});
		return resumed;
	});
}
