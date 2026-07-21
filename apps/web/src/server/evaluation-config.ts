import { createServerFn } from "@tanstack/react-start";
import {
	createEvaluationTarget,
	ensureEvaluationConfig,
	getBrandOrganizationIdForEvaluation,
	getEffectiveEvaluationTargetsForBrand,
	getEvaluationEntitlementLimits,
	listEvaluationScopeConfigsForBrand,
	listEvaluationTargets,
	updateEvaluationEntitlement,
	updateEvaluationTarget,
	updateEvaluationTargetScopeConfig,
	type EvaluationScopeOwner,
} from "@workspace/lib/evaluation-config";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	getOrgMemberRole,
	isAdmin,
	requireAuthSession,
	requireBrandAccess,
	requireOrgAccess,
} from "@/lib/auth/helpers";
import {
	canEditEvaluationConfig,
	canEditEvaluationEntitlements,
	type EvaluationConfigAction,
	type EvaluationConfigEditScope,
	type OrganizationConfigRole,
} from "@/lib/evaluation-config-policy";
import { getDeployment } from "@/lib/config/server";

const positiveNullable = z.number().int().positive().nullable().optional();

async function requireEvaluationConfigAccess(input: {
	userId: string;
	isGlobalAdmin: boolean;
	scope: EvaluationConfigEditScope;
	organizationId?: string;
	brandId?: string;
	promptId?: string;
	actions?: readonly EvaluationConfigAction[];
}): Promise<{ organizationId?: string; brandId?: string; promptId?: string }> {
	const deployment = getDeployment();
	let organizationId = input.organizationId;
	let brandId = input.brandId;
	let promptId = input.promptId;

	if (input.scope === "brand") {
		if (!brandId) throw new Error("Brand ID is required");
		organizationId = await getBrandOrganizationIdForEvaluation(brandId);
		if (!organizationId) throw new Error("Brand not found");
	}

	if (input.scope === "prompt") {
		if (!promptId) throw new Error("Prompt ID is required");
		const [prompt] = await db
			.select({ promptId: prompts.id, brandId: brands.id, organizationId: brands.organizationId })
			.from(prompts)
			.innerJoin(brands, eq(prompts.brandId, brands.id))
			.where(eq(prompts.id, promptId))
			.limit(1);
		if (!prompt) throw new Error("Prompt not found");
		brandId = prompt.brandId;
		organizationId = prompt.organizationId;
	}

	let organizationRole: OrganizationConfigRole;
	if (input.scope !== "instance") {
		if (!organizationId) throw new Error("Organization ID is required");
		organizationRole = (await getOrgMemberRole(input.userId, organizationId)) as OrganizationConfigRole;
		if (!input.isGlobalAdmin && !organizationRole) {
			throw new Error("Forbidden: No access to this organization");
		}
	}

	const actions = input.actions?.length ? input.actions : (["target-selection"] as const);
	if (
		!actions.every((action) =>
			canEditEvaluationConfig({
				mode: deployment.mode,
				isGlobalAdmin: input.isGlobalAdmin,
				organizationRole,
				scope: input.scope,
				action,
			}),
		)
	) {
		throw new Error("Forbidden: You cannot edit evaluation configuration at this scope");
	}

	return { organizationId, brandId, promptId };
}

async function requireBrandConfigReadAccess(userId: string, isGlobalAdmin: boolean, brandId: string): Promise<string> {
	const organizationId = await getBrandOrganizationIdForEvaluation(brandId);
	if (!organizationId) throw new Error("Brand not found");
	if (!isGlobalAdmin) await requireBrandAccess(userId, brandId);
	return organizationId;
}

export const getBrandEvaluationConfigFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const globalAdmin = isAdmin(session);
		const organizationId = await requireBrandConfigReadAccess(session.user.id, globalAdmin, data.brandId);
		await ensureEvaluationConfig();
		const organizationRole = (await getOrgMemberRole(session.user.id, organizationId)) as OrganizationConfigRole;
		const deployment = getDeployment();

		const canManageBrandTargets = canEditEvaluationConfig({
			mode: deployment.mode,
			isGlobalAdmin: globalAdmin,
			organizationRole,
			scope: "brand",
			action: "target-selection",
		});
		const canManageBrandRunPolicy = canEditEvaluationConfig({
			mode: deployment.mode,
			isGlobalAdmin: globalAdmin,
			organizationRole,
			scope: "brand",
			action: "run-policy",
		});
		const canReadEvaluationConfiguration = canManageBrandTargets || canManageBrandRunPolicy;
		const [targets, effectiveTargets, scopeConfigs, entitlements] = await Promise.all([
			listEvaluationTargets(),
			getEffectiveEvaluationTargetsForBrand(data.brandId),
			canReadEvaluationConfiguration ? listEvaluationScopeConfigsForBrand(data.brandId) : Promise.resolve([]),
			canReadEvaluationConfiguration ? getEvaluationEntitlementLimits(organizationId) : Promise.resolve(null),
		]);
		const effectiveTargetIds = new Set(effectiveTargets.map((target) => target.targetId));

		return {
			mode: deployment.mode,
			targets: canManageBrandTargets ? targets : targets.filter((target) => effectiveTargetIds.has(target.id)),
			effectiveTargets,
			scopeConfigs,
			entitlements,
			canManageBrandTargets,
			canManageBrandRunPolicy,
			canManageInstance: canEditEvaluationConfig({
				mode: deployment.mode,
				isGlobalAdmin: globalAdmin,
				organizationRole,
				scope: "instance",
				action: "catalog",
			}),
		};
	});

export const createEvaluationTargetFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			model: z.string().trim().min(1).max(100),
			provider: z.string().trim().min(1).max(100),
			version: z.string().trim().min(1).max(300).nullable().optional(),
			webSearch: z.boolean(),
			requiresPromptAssignment: z.boolean().optional(),
			defaultCadenceHours: z
				.number()
				.int()
				.positive()
				.max(24 * 365),
			defaultSamplesPerDispatch: z.number().int().positive().max(100),
			enabled: z.boolean().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireEvaluationConfigAccess({
			userId: session.user.id,
			isGlobalAdmin: isAdmin(session),
			scope: "instance",
			actions: ["catalog"],
		});
		return createEvaluationTarget(data, session.user.id);
	});

export const updateEvaluationTargetFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			targetId: z.string(),
			enabled: z.boolean().optional(),
			requiresPromptAssignment: z.boolean().optional(),
			defaultCadenceHours: z
				.number()
				.int()
				.positive()
				.max(24 * 365)
				.optional(),
			defaultSamplesPerDispatch: z.number().int().positive().max(100).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireEvaluationConfigAccess({
			userId: session.user.id,
			isGlobalAdmin: isAdmin(session),
			scope: "instance",
			actions: ["catalog", "run-policy"],
		});
		return updateEvaluationTarget(data, session.user.id);
	});

const scopePatchSchema = z.object({
	targetId: z.string().nullable(),
	enabled: z.boolean().nullable().optional(),
	cadenceHours: positiveNullable,
	samplesPerDispatch: positiveNullable,
});

function scopePatchActions(data: z.infer<typeof scopePatchSchema>): EvaluationConfigAction[] {
	const actions: EvaluationConfigAction[] = [];
	if (data.enabled !== undefined) actions.push("target-selection");
	if (data.cadenceHours !== undefined || data.samplesPerDispatch !== undefined) actions.push("run-policy");
	if (actions.length === 0) throw new Error("At least one evaluation configuration value is required");
	return actions;
}

export const updateOrganizationEvaluationConfigFn = createServerFn({ method: "POST" })
	.validator(z.object({ organizationId: z.string(), ...scopePatchSchema.shape }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const access = await requireEvaluationConfigAccess({
			userId: session.user.id,
			isGlobalAdmin: isAdmin(session),
			scope: "organization",
			organizationId: data.organizationId,
			actions: scopePatchActions(data),
		});
		const owner: EvaluationScopeOwner = { scope: "organization", organizationId: access.organizationId! };
		return updateEvaluationTargetScopeConfig(owner, data, session.user.id);
	});

export const updateBrandEvaluationConfigFn = createServerFn({ method: "POST" })
	.validator(z.object({ brandId: z.string(), ...scopePatchSchema.shape }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const access = await requireEvaluationConfigAccess({
			userId: session.user.id,
			isGlobalAdmin: isAdmin(session),
			scope: "brand",
			brandId: data.brandId,
			actions: scopePatchActions(data),
		});
		const owner: EvaluationScopeOwner = { scope: "brand", brandId: access.brandId! };
		return updateEvaluationTargetScopeConfig(owner, data, session.user.id);
	});

export const updatePromptEvaluationConfigFn = createServerFn({ method: "POST" })
	.validator(z.object({ promptId: z.string(), ...scopePatchSchema.shape }))
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const access = await requireEvaluationConfigAccess({
			userId: session.user.id,
			isGlobalAdmin: isAdmin(session),
			scope: "prompt",
			promptId: data.promptId,
			actions: scopePatchActions(data),
		});
		const owner: EvaluationScopeOwner = { scope: "prompt", promptId: access.promptId! };
		return updateEvaluationTargetScopeConfig(owner, data, session.user.id);
	});

export const updateEvaluationEntitlementFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			scope: z.enum(["instance", "organization"]),
			organizationId: z.string().optional(),
			maxConfiguredTargets: z.number().int().nonnegative().nullable(),
			maxConfiguredTargetsPerBrand: z.number().int().nonnegative().nullable(),
			maxConfiguredTargetsPerPrompt: z.number().int().nonnegative().nullable(),
			maxSamplesPerDispatch: z.number().int().nonnegative().nullable(),
			maxRunsPerDay: z.number().int().nonnegative().nullable(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		const deployment = getDeployment();
		const globalAdmin = isAdmin(session);
		if (!canEditEvaluationEntitlements({ mode: deployment.mode, isGlobalAdmin: globalAdmin })) {
			throw new Error("Forbidden: You cannot edit evaluation entitlements");
		}
		if (data.scope === "organization") {
			if (!data.organizationId) throw new Error("Organization ID is required");
			if (!globalAdmin) await requireOrgAccess(session.user.id, data.organizationId);
		}
		return updateEvaluationEntitlement(
			data.scope,
			{
				maxConfiguredTargets: data.maxConfiguredTargets,
				maxConfiguredTargetsPerBrand: data.maxConfiguredTargetsPerBrand,
				maxConfiguredTargetsPerPrompt: data.maxConfiguredTargetsPerPrompt,
				maxSamplesPerDispatch: data.maxSamplesPerDispatch,
				maxRunsPerDay: data.maxRunsPerDay,
			},
			session.user.id,
			data.organizationId,
		);
	});
