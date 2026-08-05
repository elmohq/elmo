import type { ResolvedEntitlements } from "@workspace/config/entitlements";
import type { DeploymentMode } from "@workspace/config/types";
import { and, count, eq } from "drizzle-orm";
import { db } from "../db/db";
import { isReservedBrandId, slugify } from "../db/provisioning";
import { brands } from "../db/schema";
import { lockOrganizationCapacity } from "./advisory-locks";
import { createOrganizationEntitlementSourceStore, resolveOrganizationEntitlements } from "./entitlements";
import { initializeDefaultBrandTracking } from "./tracking-defaults";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class EntitlementAccessError extends Error {
	constructor(public readonly reason: string) {
		super(`Cloud subscription does not permit this operation: ${reason}`);
		this.name = "EntitlementAccessError";
	}
}

export class CapacityExceededError extends Error {
	constructor(
		public readonly resource: "brands" | "prompts" | "claude-prompts" | "tracking-targets",
		public readonly limit: number,
	) {
		super(`This workspace's plan allows at most ${limit} ${resource}.`);
		this.name = "CapacityExceededError";
	}
}

export function getCapacityLimit(
	resolved: ResolvedEntitlements,
	resource: "brands" | "prompts" | "claude-prompts" | "tracking-targets",
): number | null {
	if (resolved.access === "denied") throw new EntitlementAccessError(resolved.reason);
	if (resolved.mode !== "cloud") return null;

	switch (resource) {
		case "brands":
			return resolved.entitlements.brandSlots;
		case "prompts":
			return resolved.entitlements.promptSlots;
		case "claude-prompts":
			return resolved.entitlements.claudeTracking.totalPromptSlots;
		case "tracking-targets":
			return resolved.entitlements.trackingTargets.maximumSelected;
	}
}

export function assertCapacity(input: {
	resolved: ResolvedEntitlements;
	resource: "brands" | "prompts" | "claude-prompts" | "tracking-targets";
	requestedTotal: number;
}): void {
	const limit = getCapacityLimit(input.resolved, input.resource);
	if (limit !== null && input.requestedTotal > limit) throw new CapacityExceededError(input.resource, limit);
}

/**
 * Enforces capacity without trapping a workspace that was put over its limit
 * by an external Stripe change or a contract revision. Above-limit writes may
 * only hold or reduce the current total; they can never increase it.
 */
export function assertCapacityChange(input: {
	resolved: ResolvedEntitlements;
	resource: "brands" | "prompts" | "claude-prompts";
	currentTotal: number;
	requestedTotal: number;
}): void {
	const limit = getCapacityLimit(input.resolved, input.resource);
	if (limit !== null && input.requestedTotal > limit && input.requestedTotal > input.currentTotal) {
		throw new CapacityExceededError(input.resource, limit);
	}
}

export async function withOrganizationEntitlementTransaction<T>(input: {
	mode: DeploymentMode;
	organizationId: string;
	run: (context: { tx: DbTransaction; resolved: ResolvedEntitlements }) => Promise<T>;
}): Promise<T> {
	return db.transaction(async (tx) => {
		// Capacity is organization-wide, so serialize count+mutation operations for
		// this workspace. hashtextextended avoids maintaining a lock table.
		await lockOrganizationCapacity(tx, input.organizationId);
		const resolved = await resolveOrganizationEntitlements({
			mode: input.mode,
			organizationId: input.organizationId,
			store: createOrganizationEntitlementSourceStore(tx),
		});
		if (resolved.access === "denied") throw new EntitlementAccessError(resolved.reason);
		return input.run({ tx, resolved });
	});
}

export async function createOrganizationBrand(input: {
	mode: DeploymentMode;
	organizationId: string;
	name: string;
	website: string;
	additionalDomains?: string[];
	createdByUserId?: string;
}): Promise<{ brandId: string }> {
	return withOrganizationEntitlementTransaction({
		mode: input.mode,
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			const [{ value: currentBrands = 0 } = { value: 0 }] = await tx
				.select({ value: count() })
				.from(brands)
				.where(and(eq(brands.organizationId, input.organizationId), eq(brands.enabled, true)));
			assertCapacity({ resolved, resource: "brands", requestedTotal: currentBrands + 1 });

			const base = slugify(input.name);
			let suffix = base === "new" ? 2 : 1;
			for (;;) {
				const brandId = suffix === 1 ? base : `${base}-${suffix}`;
				if (isReservedBrandId(brandId)) {
					suffix++;
					continue;
				}
				const [inserted] = await tx
					.insert(brands)
					.values({
						id: brandId,
						organizationId: input.organizationId,
						name: input.name,
						website: input.website,
						enabled: true,
						...(input.additionalDomains?.length ? { additionalDomains: input.additionalDomains } : {}),
					})
					.onConflictDoNothing({ target: brands.id })
					.returning({ id: brands.id });
				if (inserted) {
					if (resolved.mode === "cloud" && resolved.access === "allowed") {
						await initializeDefaultBrandTracking({
							tx,
							resolved,
							organizationId: input.organizationId,
							brandId: inserted.id,
							createdByUserId: input.createdByUserId,
						});
					}
					return { brandId: inserted.id };
				}
				suffix++;
			}
		},
	});
}
