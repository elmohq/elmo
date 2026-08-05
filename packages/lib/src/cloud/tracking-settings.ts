import type { ResolvedEntitlements } from "@workspace/config/entitlements";
import {
	CLAUDE_TRACKING_TARGET_KEYS,
	type ClaudeTrackingMode,
	getClaudeTrackingMode,
	getClaudeTrackingTargetKey,
	type TrackingTargetPolicy,
} from "@workspace/config/plans";
import type { DeploymentMode } from "@workspace/config/types";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import type { db } from "../db/db";
import {
	brandSchedulerRollouts,
	brands,
	brandTargetSelections,
	prompts,
	promptTargetAssignments,
	trackingSchedules,
} from "../db/schema";
import { assertCapacityChange, CapacityExceededError, withOrganizationEntitlementTransaction } from "./capacity";
import { markOrganizationEntitlementReconciliationDue } from "./entitlement-reconciliation-cursor";
import { resolveRuntimeTrackingPolicy } from "./tracking-policy";

export { initializeDefaultBrandTracking } from "./tracking-defaults";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AllowedCloudEntitlements = Extract<ResolvedEntitlements, { mode: "cloud"; access: "allowed" }>;

export type RequestedTrackingTarget = {
	targetKey: string;
	requestedCadenceMinutes?: number | null;
};

export type RequestedClaudePromptAssignment = {
	promptId: string;
	mode: ClaudeTrackingMode;
};

export class TrackingSettingsError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TrackingSettingsError";
	}
}

function targetPolicyMap(resolved: AllowedCloudEntitlements): Map<string, TrackingTargetPolicy> {
	return new Map(resolved.entitlements.trackingTargets.targets.map((target) => [target.targetKey, target]));
}

export function resolveRequestedCadence(
	policy: TrackingTargetPolicy,
	requestedCadenceMinutes: number | null | undefined,
): { effectiveCadenceMinutes: number; storedCadenceMinutes: number | null } {
	if (requestedCadenceMinutes === null || requestedCadenceMinutes === undefined) {
		return { effectiveCadenceMinutes: policy.schedule.cadenceMinutes, storedCadenceMinutes: null };
	}
	if (!Number.isSafeInteger(requestedCadenceMinutes)) {
		throw new TrackingSettingsError(`Cadence for ${policy.targetKey} must be a whole number of minutes.`);
	}

	const cadencePolicy = policy.schedule.cadencePolicy;
	if (cadencePolicy.mode === "fixed") {
		if (requestedCadenceMinutes !== policy.schedule.cadenceMinutes) {
			throw new TrackingSettingsError(`Cadence for ${policy.targetKey} is fixed by the plan.`);
		}
		return { effectiveCadenceMinutes: policy.schedule.cadenceMinutes, storedCadenceMinutes: null };
	}
	if (
		requestedCadenceMinutes < cadencePolicy.minimumCadenceMinutes ||
		requestedCadenceMinutes > cadencePolicy.maximumCadenceMinutes
	) {
		throw new TrackingSettingsError(
			`Cadence for ${policy.targetKey} must be between ${cadencePolicy.minimumCadenceMinutes} and ${cadencePolicy.maximumCadenceMinutes} minutes.`,
		);
	}
	return { effectiveCadenceMinutes: requestedCadenceMinutes, storedCadenceMinutes: requestedCadenceMinutes };
}

export function validateRequestedTrackingTargets(
	resolved: AllowedCloudEntitlements,
	requested: readonly RequestedTrackingTarget[],
): Array<{
	targetKey: string;
	requestedCadenceMinutes: number | null;
	effectiveCadenceMinutes: number;
}> {
	const definition = resolved.entitlements.trackingTargets;
	const policies = targetPolicyMap(resolved);
	const seen = new Set<string>();
	const normalized = requested.map((selection) => {
		if (seen.has(selection.targetKey))
			throw new TrackingSettingsError(`Target ${selection.targetKey} was selected twice.`);
		seen.add(selection.targetKey);
		const policy = policies.get(selection.targetKey);
		if (!policy) throw new TrackingSettingsError(`Target ${selection.targetKey} is not available on this plan.`);
		const cadence = resolveRequestedCadence(policy, selection.requestedCadenceMinutes);
		return {
			targetKey: selection.targetKey,
			requestedCadenceMinutes: cadence.storedCadenceMinutes,
			effectiveCadenceMinutes: cadence.effectiveCadenceMinutes,
		};
	});

	if (normalized.length < definition.minimumSelected) {
		throw new TrackingSettingsError(`This plan requires at least ${definition.minimumSelected} tracking target(s).`);
	}
	if (normalized.length > definition.maximumSelected) {
		throw new CapacityExceededError("tracking-targets", definition.maximumSelected);
	}
	if (definition.mode === "fixed") {
		const required = new Set(definition.targets.map((target) => target.targetKey));
		if (normalized.length !== required.size || normalized.some((selection) => !required.has(selection.targetKey))) {
			throw new TrackingSettingsError("This plan's tracking targets are fixed.");
		}
	}
	return normalized;
}

export function validateRequestedClaudePromptAssignments(
	resolved: AllowedCloudEntitlements,
	requested: readonly RequestedClaudePromptAssignment[],
): Array<RequestedClaudePromptAssignment & { targetKey: (typeof CLAUDE_TRACKING_TARGET_KEYS)[number] }> {
	const claude = resolved.entitlements.claudeTracking;
	const seenPromptIds = new Set<string>();
	return requested.map((assignment) => {
		if (seenPromptIds.has(assignment.promptId)) {
			throw new TrackingSettingsError("A Claude prompt was selected twice.");
		}
		seenPromptIds.add(assignment.promptId);
		if (!claude.enabled || !claude.allowedModes.includes(assignment.mode)) {
			throw new TrackingSettingsError(`Claude ${assignment.mode} tracking is not available on this plan.`);
		}
		return { ...assignment, targetKey: getClaudeTrackingTargetKey(assignment.mode) };
	});
}

async function assertBrandOrganization(tx: DbTransaction, organizationId: string, brandId: string): Promise<void> {
	const [brand] = await tx
		.select({ id: brands.id })
		.from(brands)
		.where(and(eq(brands.id, brandId), eq(brands.organizationId, organizationId)))
		.limit(1);
	if (!brand) throw new TrackingSettingsError("Brand does not belong to this organization.");
}

/** Rebuilds managed assignments and schedules from durable selections. */
export async function reconcileBrandTrackingSettings(input: {
	tx: DbTransaction;
	resolved: AllowedCloudEntitlements;
	organizationId: string;
	brandId: string;
	now?: Date;
}): Promise<void> {
	await assertBrandOrganization(input.tx, input.organizationId, input.brandId);
	const now = input.now ?? new Date();
	let [rollout] = await input.tx
		.select({ generation: brandSchedulerRollouts.generation })
		.from(brandSchedulerRollouts)
		.where(eq(brandSchedulerRollouts.brandId, input.brandId))
		.limit(1);
	if (!rollout) {
		[rollout] = await input.tx
			.insert(brandSchedulerRollouts)
			.values({ brandId: input.brandId, mode: "v2", generation: 1, cutoverAt: now })
			.returning({ generation: brandSchedulerRollouts.generation });
	}

	const selected = await input.tx
		.select()
		.from(brandTargetSelections)
		.where(and(eq(brandTargetSelections.brandId, input.brandId), eq(brandTargetSelections.enabled, true)));
	const normalizedSelections = validateRequestedTrackingTargets(
		input.resolved,
		selected.map((selection) => ({
			targetKey: selection.targetKey,
			requestedCadenceMinutes: selection.requestedCadenceMinutes,
		})),
	);
	const normalizedByKey = new Map(normalizedSelections.map((selection) => [selection.targetKey, selection]));
	const selectionByKey = new Map(selected.map((selection) => [selection.targetKey, selection]));

	const brandPrompts = await input.tx
		.select({ id: prompts.id, enabled: prompts.enabled })
		.from(prompts)
		.where(eq(prompts.brandId, input.brandId));
	const currentAssignments = await input.tx
		.select()
		.from(promptTargetAssignments)
		.where(eq(promptTargetAssignments.brandId, input.brandId));
	const currentByPromptTarget = new Map(
		currentAssignments.map((assignment) => [`${assignment.promptId}:${assignment.targetKey}`, assignment]),
	);
	const desiredBrandAssignments = brandPrompts.flatMap((prompt) =>
		selected.flatMap((selection) => {
			const existing = currentByPromptTarget.get(`${prompt.id}:${selection.targetKey}`);
			if (existing && existing.source !== "brand_selection") return [];
			return [
				{
					brandId: input.brandId,
					promptId: prompt.id,
					brandTargetSelectionId: selection.id,
					targetKey: selection.targetKey,
					source: "brand_selection" as const,
					enabled: true,
				},
			];
		}),
	);
	if (desiredBrandAssignments.length > 0) {
		await input.tx
			.insert(promptTargetAssignments)
			.values(desiredBrandAssignments)
			.onConflictDoUpdate({
				target: [promptTargetAssignments.promptId, promptTargetAssignments.targetKey],
				set: {
					brandTargetSelectionId: sql`excluded.brand_target_selection_id`,
					source: "brand_selection",
					enabled: true,
					updatedAt: now,
				},
			});
	}

	const selectedKeys = selected.map((selection) => selection.targetKey);
	await input.tx
		.update(promptTargetAssignments)
		.set({ enabled: false, updatedAt: now })
		.where(
			and(
				eq(promptTargetAssignments.brandId, input.brandId),
				eq(promptTargetAssignments.source, "brand_selection"),
				...(selectedKeys.length > 0 ? [notInArray(promptTargetAssignments.targetKey, selectedKeys)] : []),
			),
		);
	const disabledPromptIds = brandPrompts.filter((prompt) => !prompt.enabled).map((prompt) => prompt.id);
	if (disabledPromptIds.length > 0) {
		await input.tx
			.update(promptTargetAssignments)
			.set({ enabled: false, updatedAt: now })
			.where(
				and(
					eq(promptTargetAssignments.brandId, input.brandId),
					eq(promptTargetAssignments.source, "premium"),
					inArray(promptTargetAssignments.promptId, disabledPromptIds),
				),
			);
	}

	const assignments = await input.tx
		.select({
			id: promptTargetAssignments.id,
			promptId: promptTargetAssignments.promptId,
			targetKey: promptTargetAssignments.targetKey,
			source: promptTargetAssignments.source,
			enabled: promptTargetAssignments.enabled,
			brandTargetSelectionId: promptTargetAssignments.brandTargetSelectionId,
			promptEnabled: prompts.enabled,
		})
		.from(promptTargetAssignments)
		.innerJoin(prompts, and(eq(prompts.id, promptTargetAssignments.promptId), eq(prompts.brandId, input.brandId)))
		.where(eq(promptTargetAssignments.brandId, input.brandId));
	const managedAssignments = assignments.filter((assignment) => assignment.source !== "custom");
	const managedAssignmentIds = managedAssignments.map((assignment) => assignment.id);
	// Capture the pre-reconcile state before the blanket deactivation below.
	// Otherwise every unchanged schedule appears newly inactive, which bumps its
	// policy version and resets next_due_at to now on every prompt text/tag edit.
	const existingSchedules = await input.tx
		.select()
		.from(trackingSchedules)
		.where(eq(trackingSchedules.brandId, input.brandId));
	const existingScheduleByAssignment = new Map(
		existingSchedules.map((schedule) => [schedule.promptTargetAssignmentId, schedule]),
	);
	if (managedAssignmentIds.length > 0) {
		await input.tx
			.update(trackingSchedules)
			.set({ active: false, updatedAt: now })
			.where(inArray(trackingSchedules.promptTargetAssignmentId, managedAssignmentIds));
	}
	const policies = targetPolicyMap(input.resolved);
	const premiumModesPerPrompt = new Map<string, number>();
	for (const assignment of managedAssignments) {
		if (
			assignment.source === "premium" &&
			assignment.enabled &&
			assignment.promptEnabled &&
			getClaudeTrackingMode(assignment.targetKey)
		) {
			premiumModesPerPrompt.set(assignment.promptId, (premiumModesPerPrompt.get(assignment.promptId) ?? 0) + 1);
		}
	}
	const desiredSchedules = managedAssignments.flatMap((assignment) => {
		if (!assignment.enabled || !assignment.promptEnabled) return [];

		let cadenceMinutes: number;
		let samplesPerOccurrence: number;
		if (assignment.source === "brand_selection") {
			const selection = selectionByKey.get(assignment.targetKey);
			const normalized = normalizedByKey.get(assignment.targetKey);
			const policy = policies.get(assignment.targetKey);
			if (!selection?.enabled || !normalized || !policy) return [];
			cadenceMinutes = normalized.effectiveCadenceMinutes;
			samplesPerOccurrence = policy.schedule.samplesPerEvaluation;
		} else {
			if (premiumModesPerPrompt.get(assignment.promptId) !== 1) return [];
			const claude = input.resolved.entitlements.claudeTracking;
			const claudeMode = getClaudeTrackingMode(assignment.targetKey);
			if (!claudeMode || !claude.enabled || !claude.allowedModes.includes(claudeMode) || !claude.schedule) {
				return [];
			}
			cadenceMinutes = claude.schedule.cadenceMinutes;
			samplesPerOccurrence = claude.schedule.samplesPerEvaluation;
		}

		if (
			!resolveRuntimeTrackingPolicy({
				resolved: input.resolved,
				assignmentSource: assignment.source,
				targetKey: assignment.targetKey,
				cadenceMinutes,
				samplesPerOccurrence,
			})
		) {
			return [];
		}

		const existing = existingScheduleByAssignment.get(assignment.id);
		const policyChanged =
			!existing?.active ||
			existing.generation !== rollout.generation ||
			existing.cadenceMinutes !== cadenceMinutes ||
			existing.samplesPerOccurrence !== samplesPerOccurrence;
		return [
			{
				brandId: input.brandId,
				promptId: assignment.promptId,
				promptTargetAssignmentId: assignment.id,
				targetKey: assignment.targetKey,
				cadenceMinutes,
				samplesPerOccurrence,
				active: true,
				nextDueAt: policyChanged ? now : (existing.nextDueAt ?? now),
				generation: rollout.generation,
				policyVersion: policyChanged ? (existing?.policyVersion ?? 0) + 1 : existing.policyVersion,
			},
		];
	});
	if (desiredSchedules.length > 0) {
		await input.tx
			.insert(trackingSchedules)
			.values(desiredSchedules)
			.onConflictDoUpdate({
				target: [trackingSchedules.promptId, trackingSchedules.targetKey],
				set: {
					promptTargetAssignmentId: sql`excluded.prompt_target_assignment_id`,
					cadenceMinutes: sql`excluded.cadence_minutes`,
					samplesPerOccurrence: sql`excluded.samples_per_occurrence`,
					active: true,
					nextDueAt: sql`excluded.next_due_at`,
					generation: sql`excluded.generation`,
					policyVersion: sql`excluded.policy_version`,
					updatedAt: now,
				},
			});
	}
	await markOrganizationEntitlementReconciliationDue({
		tx: input.tx,
		organizationId: input.organizationId,
		reconcileAfter: now,
	});
}

export async function updateBrandTrackingTargets(input: {
	mode: DeploymentMode;
	organizationId: string;
	brandId: string;
	selections: RequestedTrackingTarget[];
	createdByUserId: string;
}): Promise<void> {
	if (input.mode !== "cloud")
		throw new TrackingSettingsError("Plan tracking settings are only available in cloud mode.");
	await withOrganizationEntitlementTransaction({
		mode: input.mode,
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			if (resolved.mode !== "cloud" || resolved.access !== "allowed") {
				throw new TrackingSettingsError("An active cloud plan is required.");
			}
			await assertBrandOrganization(tx, input.organizationId, input.brandId);
			const normalized = validateRequestedTrackingTargets(resolved, input.selections);
			const selectedKeys = normalized.map((selection) => selection.targetKey);
			await tx
				.update(brandTargetSelections)
				.set({ enabled: false, updatedAt: new Date() })
				.where(
					and(
						eq(brandTargetSelections.brandId, input.brandId),
						...(selectedKeys.length > 0 ? [notInArray(brandTargetSelections.targetKey, selectedKeys)] : []),
					),
				);
			for (const selection of normalized) {
				await tx
					.insert(brandTargetSelections)
					.values({
						brandId: input.brandId,
						targetKey: selection.targetKey,
						requestedCadenceMinutes: selection.requestedCadenceMinutes,
						source: "user",
						enabled: true,
						createdByUserId: input.createdByUserId,
					})
					.onConflictDoUpdate({
						target: [brandTargetSelections.brandId, brandTargetSelections.targetKey],
						set: {
							requestedCadenceMinutes: selection.requestedCadenceMinutes,
							source: "user",
							enabled: true,
							createdByUserId: input.createdByUserId,
							updatedAt: new Date(),
						},
					});
			}
			await reconcileBrandTrackingSettings({
				tx,
				resolved,
				organizationId: input.organizationId,
				brandId: input.brandId,
			});
		},
	});
}

export async function updateClaudePromptAssignments(input: {
	mode: DeploymentMode;
	organizationId: string;
	brandId: string;
	assignments: RequestedClaudePromptAssignment[];
}): Promise<void> {
	if (input.mode !== "cloud") throw new TrackingSettingsError("Claude plan settings are only available in cloud mode.");
	await withOrganizationEntitlementTransaction({
		mode: input.mode,
		organizationId: input.organizationId,
		run: async ({ tx, resolved }) => {
			if (resolved.mode !== "cloud" || resolved.access !== "allowed") {
				throw new TrackingSettingsError("An active cloud plan is required.");
			}
			await assertBrandOrganization(tx, input.organizationId, input.brandId);
			const normalized = validateRequestedClaudePromptAssignments(resolved, input.assignments);
			const uniquePromptIds = normalized.map((assignment) => assignment.promptId);
			const selectedPrompts =
				uniquePromptIds.length === 0
					? []
					: await tx
							.select({ id: prompts.id })
							.from(prompts)
							.where(
								and(
									eq(prompts.brandId, input.brandId),
									eq(prompts.enabled, true),
									inArray(prompts.id, uniquePromptIds),
								),
							);
			if (selectedPrompts.length !== uniquePromptIds.length) {
				throw new TrackingSettingsError("Claude tracking can only be assigned to enabled prompts in this brand.");
			}

			const activeOutsideBrand = await tx
				.select({ promptId: promptTargetAssignments.promptId })
				.from(promptTargetAssignments)
				.innerJoin(prompts, eq(prompts.id, promptTargetAssignments.promptId))
				.innerJoin(brands, eq(brands.id, prompts.brandId))
				.where(
					and(
						eq(brands.organizationId, input.organizationId),
						ne(brands.id, input.brandId),
						eq(promptTargetAssignments.source, "premium"),
						inArray(promptTargetAssignments.targetKey, CLAUDE_TRACKING_TARGET_KEYS),
						eq(promptTargetAssignments.enabled, true),
						eq(prompts.enabled, true),
					),
				);
			const activeInsideBrand = await tx
				.select({ promptId: promptTargetAssignments.promptId })
				.from(promptTargetAssignments)
				.innerJoin(prompts, eq(prompts.id, promptTargetAssignments.promptId))
				.where(
					and(
						eq(promptTargetAssignments.brandId, input.brandId),
						eq(promptTargetAssignments.source, "premium"),
						inArray(promptTargetAssignments.targetKey, CLAUDE_TRACKING_TARGET_KEYS),
						eq(promptTargetAssignments.enabled, true),
						eq(prompts.enabled, true),
					),
				);
			const activeOutsidePromptIds = new Set(activeOutsideBrand.map((assignment) => assignment.promptId));
			const activeInsidePromptIds = new Set(activeInsideBrand.map((assignment) => assignment.promptId));
			assertCapacityChange({
				resolved,
				resource: "claude-prompts",
				currentTotal: activeOutsidePromptIds.size + activeInsidePromptIds.size,
				requestedTotal: activeOutsidePromptIds.size + uniquePromptIds.length,
			});

			const now = new Date();
			await tx
				.update(promptTargetAssignments)
				.set({ enabled: false, updatedAt: now })
				.where(and(eq(promptTargetAssignments.brandId, input.brandId), eq(promptTargetAssignments.source, "premium")));
			for (const assignment of normalized) {
				const [conflict] = await tx
					.select({ source: promptTargetAssignments.source })
					.from(promptTargetAssignments)
					.where(
						and(
							eq(promptTargetAssignments.promptId, assignment.promptId),
							inArray(promptTargetAssignments.targetKey, CLAUDE_TRACKING_TARGET_KEYS),
							ne(promptTargetAssignments.source, "premium"),
						),
					)
					.limit(1);
				if (conflict) {
					throw new TrackingSettingsError(
						`Prompt ${assignment.promptId} already has an operator-managed Claude assignment.`,
					);
				}
				await tx
					.insert(promptTargetAssignments)
					.values({
						brandId: input.brandId,
						promptId: assignment.promptId,
						targetKey: assignment.targetKey,
						source: "premium",
						enabled: true,
					})
					.onConflictDoUpdate({
						target: [promptTargetAssignments.promptId, promptTargetAssignments.targetKey],
						set: { source: "premium", enabled: true, updatedAt: now },
					});
			}
			await reconcileBrandTrackingSettings({
				tx,
				resolved,
				organizationId: input.organizationId,
				brandId: input.brandId,
			});
		},
	});
}
