import { createServerFn } from "@tanstack/react-start";
import type { ResolvedEntitlements } from "@workspace/config/entitlements";
import {
	CLAUDE_TRACKING_MODES,
	CLAUDE_TRACKING_TARGET_KEYS,
	type ClaudeTrackingMode,
	getClaudeTrackingMode,
	trackingTargetKeySchema,
} from "@workspace/config/plans";
import { resolveOrganizationEntitlements } from "@workspace/lib/cloud/entitlements";
import { updateBrandTrackingTargets, updateClaudePromptAssignments } from "@workspace/lib/cloud/tracking-settings";
import { db } from "@workspace/lib/db/db";
import { brands, brandTargetSelections, prompts, promptTargetAssignments } from "@workspace/lib/db/schema";
import { and, asc, countDistinct, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandOrganization } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";

const brandInputSchema = z.object({ brandId: z.string().min(1).max(200) });

const targetSelectionSchema = z.object({
	targetKey: trackingTargetKeySchema,
	requestedCadenceMinutes: z.number().int().positive().nullable().optional(),
});

export type CloudTrackingSettingsData = {
	mode: "cloud";
	resolved: Extract<ResolvedEntitlements, { mode: "cloud" }>;
	selections: Array<{
		targetKey: string;
		requestedCadenceMinutes: number | null;
	}>;
	prompts: Array<{ id: string; value: string }>;
	claudeAssignments: Array<{ promptId: string; mode: ClaudeTrackingMode }>;
	claudeUsage: {
		usedPromptSlots: number;
		totalPromptSlots: number;
		includedPromptSlots: number;
		purchasedAddonPromptSlots: number;
	};
};

export const getTrackingSettingsPageModeFn = createServerFn({ method: "GET" }).handler(async () => ({
	mode: getDeployment().mode,
}));

export const getBrandTrackingSettingsFn = createServerFn({ method: "GET" })
	.validator(brandInputSchema)
	.handler(async ({ data }): Promise<CloudTrackingSettingsData> => {
		const session = await requireAuthSession();
		const organization = await requireBrandOrganization(session.user.id, data.brandId);
		const deployment = getDeployment();
		if (deployment.mode !== "cloud") {
			throw new Error("Plan tracking settings are only available in cloud mode.");
		}

		const resolved = await resolveOrganizationEntitlements({
			mode: deployment.mode,
			organizationId: organization.id,
		});
		if (resolved.mode !== "cloud") throw new Error("Cloud entitlement resolution returned a legacy policy.");

		const [selections, enabledPrompts, claudeAssignments, [claudeUsage]] = await Promise.all([
			db
				.select({
					targetKey: brandTargetSelections.targetKey,
					requestedCadenceMinutes: brandTargetSelections.requestedCadenceMinutes,
				})
				.from(brandTargetSelections)
				.where(and(eq(brandTargetSelections.brandId, data.brandId), eq(brandTargetSelections.enabled, true)))
				.orderBy(brandTargetSelections.createdAt, brandTargetSelections.targetKey),
			db
				.select({ id: prompts.id, value: prompts.value })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)))
				.orderBy(asc(prompts.value), asc(prompts.id)),
			db
				.select({
					promptId: promptTargetAssignments.promptId,
					targetKey: promptTargetAssignments.targetKey,
				})
				.from(promptTargetAssignments)
				.innerJoin(prompts, eq(prompts.id, promptTargetAssignments.promptId))
				.where(
					and(
						eq(promptTargetAssignments.brandId, data.brandId),
						eq(promptTargetAssignments.source, "premium"),
						inArray(promptTargetAssignments.targetKey, CLAUDE_TRACKING_TARGET_KEYS),
						eq(promptTargetAssignments.enabled, true),
						eq(prompts.enabled, true),
					),
				),
			db
				.select({ value: countDistinct(promptTargetAssignments.promptId) })
				.from(promptTargetAssignments)
				.innerJoin(prompts, eq(prompts.id, promptTargetAssignments.promptId))
				.innerJoin(brands, eq(brands.id, prompts.brandId))
				.where(
					and(
						eq(brands.organizationId, organization.id),
						eq(promptTargetAssignments.source, "premium"),
						inArray(promptTargetAssignments.targetKey, CLAUDE_TRACKING_TARGET_KEYS),
						eq(promptTargetAssignments.enabled, true),
						eq(prompts.enabled, true),
					),
				),
		]);

		const seenClaudePromptIds = new Set<string>();
		const normalizedClaudeAssignments = claudeAssignments.map((assignment) => {
			const mode = getClaudeTrackingMode(assignment.targetKey);
			if (!mode || seenClaudePromptIds.has(assignment.promptId)) {
				throw new Error("Claude prompt assignments contain conflicting tracking modes.");
			}
			seenClaudePromptIds.add(assignment.promptId);
			return { promptId: assignment.promptId, mode };
		});

		return {
			mode: "cloud",
			resolved,
			selections,
			prompts: enabledPrompts,
			claudeAssignments: normalizedClaudeAssignments,
			claudeUsage: {
				usedPromptSlots: claudeUsage?.value ?? 0,
				totalPromptSlots: resolved.access === "allowed" ? resolved.entitlements.claudeTracking.totalPromptSlots : 0,
				includedPromptSlots:
					resolved.access === "allowed" ? resolved.entitlements.claudeTracking.includedPromptSlots : 0,
				purchasedAddonPromptSlots:
					resolved.access === "allowed" ? resolved.entitlements.claudeTracking.purchasedAddonPromptSlots : 0,
			},
		};
	});

export const updateBrandTargetsFn = createServerFn({ method: "POST" })
	.validator(
		brandInputSchema.extend({
			selections: z.array(targetSelectionSchema),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const organization = await requireBrandOrganization(session.user.id, data.brandId);
		const deployment = getDeployment();
		if (deployment.mode !== "cloud") {
			throw new Error("Plan tracking settings are only available in cloud mode.");
		}
		await updateBrandTrackingTargets({
			mode: deployment.mode,
			organizationId: organization.id,
			brandId: data.brandId,
			selections: data.selections,
			createdByUserId: session.user.id,
		});
		return { success: true as const };
	});

export const updateClaudePromptAssignmentsFn = createServerFn({ method: "POST" })
	.validator(
		brandInputSchema.extend({
			assignments: z.array(
				z.object({
					promptId: z.string().uuid(),
					mode: z.enum(CLAUDE_TRACKING_MODES),
				}),
			),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const organization = await requireBrandOrganization(session.user.id, data.brandId);
		const deployment = getDeployment();
		if (deployment.mode !== "cloud") {
			throw new Error("Claude plan settings are only available in cloud mode.");
		}
		await updateClaudePromptAssignments({
			mode: deployment.mode,
			organizationId: organization.id,
			brandId: data.brandId,
			assignments: data.assignments,
		});
		return { success: true as const };
	});
