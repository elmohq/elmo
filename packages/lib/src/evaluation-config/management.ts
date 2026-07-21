import type { ModelConfig } from "@workspace/config/scrape-targets";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import {
	brands,
	evaluationConfigAuditLogs,
	evaluationEntitlements,
	evaluationTargetScopeConfigs,
	evaluationTargets,
	instanceSettings,
	providerConnections,
} from "../db/schema";
import { getProvider } from "../providers";
import type { EvaluationConfigScope, EvaluationEntitlementLimits } from "./types";

export interface CreateEvaluationTargetInput {
	model: string;
	provider: string;
	version?: string | null;
	webSearch: boolean;
	requiresPromptAssignment?: boolean;
	defaultCadenceHours: number;
	defaultSamplesPerDispatch: number;
	enabled?: boolean;
}

export interface UpdateEvaluationTargetInput {
	targetId: string;
	enabled?: boolean;
	requiresPromptAssignment?: boolean;
	defaultCadenceHours?: number;
	defaultSamplesPerDispatch?: number;
}

export type EvaluationScopeOwner =
	| { scope: "organization"; organizationId: string }
	| { scope: "brand"; brandId: string }
	| { scope: "prompt"; promptId: string };

export interface ScopeConfigPatch {
	targetId: string | null;
	enabled?: boolean | null;
	cadenceHours?: number | null;
	samplesPerDispatch?: number | null;
}

export interface EntitlementPatch extends EvaluationEntitlementLimits {}

function managedTargetKey(
	input: Pick<CreateEvaluationTargetInput, "model" | "provider" | "version" | "webSearch">,
): string {
	return [
		"managed",
		encodeURIComponent(input.provider),
		encodeURIComponent(input.model),
		encodeURIComponent(input.version ?? "default"),
		input.webSearch ? "online" : "offline",
	].join(":");
}

function legacyProviderConnectionKey(provider: string): string {
	return `legacy-env:${provider}`;
}

function validateTargetInput(input: CreateEvaluationTargetInput): void {
	const config: ModelConfig = {
		model: input.model,
		provider: input.provider,
		version: input.version ?? undefined,
		webSearch: input.webSearch,
	};
	const provider = getProvider(config.provider);
	if (
		(config.provider === "openai-api" ||
			config.provider === "anthropic-api" ||
			config.provider === "mistral-api" ||
			config.provider === "openrouter") &&
		!config.version
	) {
		throw new Error(`Provider "${config.provider}" requires a version`);
	}
	const targetError = provider.validateTarget?.(config);
	if (targetError) throw new Error(targetError);
	if (input.enabled !== false && !provider.isConfigured()) {
		throw new Error(`Provider "${config.provider}" credentials are not configured`);
	}
}

async function ensureInstanceSettingsInTransaction(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<void> {
	await tx.insert(instanceSettings).values({ id: "default" }).onConflictDoNothing();
}

async function bumpConfigurationVersion(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<void> {
	await tx
		.update(instanceSettings)
		.set({
			configurationVersion: sql`${instanceSettings.configurationVersion} + 1`,
			updatedAt: new Date(),
		})
		.where(eq(instanceSettings.id, "default"));
}

async function addAuditLog(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	input: {
		actorUserId?: string;
		action: string;
		owner?: EvaluationScopeOwner;
		diff: Record<string, unknown>;
	},
): Promise<void> {
	await tx.insert(evaluationConfigAuditLogs).values({
		actorUserId: input.actorUserId,
		action: input.action,
		scope: input.owner?.scope,
		organizationId: input.owner?.scope === "organization" ? input.owner.organizationId : undefined,
		brandId: input.owner?.scope === "brand" ? input.owner.brandId : undefined,
		promptId: input.owner?.scope === "prompt" ? input.owner.promptId : undefined,
		diff: input.diff,
	});
}

export async function listEvaluationTargets() {
	return db
		.select({
			id: evaluationTargets.id,
			key: evaluationTargets.key,
			model: evaluationTargets.model,
			provider: providerConnections.provider,
			providerConnectionId: evaluationTargets.providerConnectionId,
			credentialSource: providerConnections.credentialSource,
			connectionEnabled: providerConnections.enabled,
			version: evaluationTargets.version,
			webSearch: evaluationTargets.webSearch,
			enabled: evaluationTargets.enabled,
			requiresPromptAssignment: evaluationTargets.requiresPromptAssignment,
			defaultCadenceHours: evaluationTargets.defaultCadenceHours,
			defaultSamplesPerDispatch: evaluationTargets.defaultSamplesPerDispatch,
		})
		.from(evaluationTargets)
		.innerJoin(providerConnections, eq(evaluationTargets.providerConnectionId, providerConnections.id))
		.orderBy(evaluationTargets.key);
}

export async function createEvaluationTarget(input: CreateEvaluationTargetInput, actorUserId?: string) {
	validateTargetInput(input);
	const key = managedTargetKey(input);

	return db.transaction(async (tx) => {
		await ensureInstanceSettingsInTransaction(tx);
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`elmo:evaluation-target:${key}`}))`);

		await tx
			.insert(providerConnections)
			.values({
				key: legacyProviderConnectionKey(input.provider),
				provider: input.provider,
				credentialSource: "legacy_env",
				credentialReference: { source: "environment" },
			})
			.onConflictDoNothing();
		const [connection] = await tx
			.select({ id: providerConnections.id })
			.from(providerConnections)
			.where(eq(providerConnections.key, legacyProviderConnectionKey(input.provider)))
			.limit(1);
		if (!connection) throw new Error(`Could not create provider connection for "${input.provider}"`);

		const [created] = await tx
			.insert(evaluationTargets)
			.values({
				key,
				model: input.model,
				providerConnectionId: connection.id,
				version: input.version ?? null,
				webSearch: input.webSearch,
				enabled: input.enabled ?? true,
				requiresPromptAssignment: input.requiresPromptAssignment ?? false,
				defaultCadenceHours: input.defaultCadenceHours,
				defaultSamplesPerDispatch: input.defaultSamplesPerDispatch,
			})
			.onConflictDoNothing()
			.returning();
		const target =
			created ?? (await tx.select().from(evaluationTargets).where(eq(evaluationTargets.key, key)).limit(1))[0];
		if (!target) throw new Error("Could not create evaluation target");

		if (created) {
			await bumpConfigurationVersion(tx);
			await addAuditLog(tx, {
				actorUserId,
				action: "evaluation_target.created",
				diff: { targetId: target.id, key: target.key },
			});
		}
		return target;
	});
}

export async function updateEvaluationTarget(input: UpdateEvaluationTargetInput, actorUserId?: string) {
	return db.transaction(async (tx) => {
		await ensureInstanceSettingsInTransaction(tx);
		const [target] = await tx.select().from(evaluationTargets).where(eq(evaluationTargets.id, input.targetId)).limit(1);
		if (!target) throw new Error("Evaluation target not found");

		const [updated] = await tx
			.update(evaluationTargets)
			.set({
				...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
				...(input.requiresPromptAssignment !== undefined
					? { requiresPromptAssignment: input.requiresPromptAssignment }
					: {}),
				...(input.defaultCadenceHours !== undefined ? { defaultCadenceHours: input.defaultCadenceHours } : {}),
				...(input.defaultSamplesPerDispatch !== undefined
					? { defaultSamplesPerDispatch: input.defaultSamplesPerDispatch }
					: {}),
				updatedAt: new Date(),
			})
			.where(eq(evaluationTargets.id, input.targetId))
			.returning();
		if (!updated) throw new Error("Could not update evaluation target");

		await bumpConfigurationVersion(tx);
		await addAuditLog(tx, {
			actorUserId,
			action: "evaluation_target.updated",
			diff: { ...input, targetId: updated.id },
		});
		return updated;
	});
}

function scopeOwnerId(owner: EvaluationScopeOwner): string {
	switch (owner.scope) {
		case "organization":
			return owner.organizationId;
		case "brand":
			return owner.brandId;
		case "prompt":
			return owner.promptId;
	}
}

function scopeOwnerValues(owner: EvaluationScopeOwner) {
	switch (owner.scope) {
		case "organization":
			return { scope: owner.scope, organizationId: owner.organizationId } as const;
		case "brand":
			return { scope: owner.scope, brandId: owner.brandId } as const;
		case "prompt":
			return { scope: owner.scope, promptId: owner.promptId } as const;
	}
}

function scopeOwnerCondition(owner: EvaluationScopeOwner) {
	switch (owner.scope) {
		case "organization":
			return eq(evaluationTargetScopeConfigs.organizationId, owner.organizationId);
		case "brand":
			return eq(evaluationTargetScopeConfigs.brandId, owner.brandId);
		case "prompt":
			return eq(evaluationTargetScopeConfigs.promptId, owner.promptId);
	}
}

export async function updateEvaluationTargetScopeConfig(
	owner: EvaluationScopeOwner,
	patch: ScopeConfigPatch,
	actorUserId?: string,
) {
	return db.transaction(async (tx) => {
		await ensureInstanceSettingsInTransaction(tx);
		await tx.execute(
			sql`SELECT pg_advisory_xact_lock(hashtext(${`elmo:evaluation-scope:${owner.scope}:${scopeOwnerId(owner)}:${patch.targetId ?? "default"}`}))`,
		);
		const targetCondition = patch.targetId
			? eq(evaluationTargetScopeConfigs.targetId, patch.targetId)
			: isNull(evaluationTargetScopeConfigs.targetId);
		const [existing] = await tx
			.select()
			.from(evaluationTargetScopeConfigs)
			.where(and(eq(evaluationTargetScopeConfigs.scope, owner.scope), scopeOwnerCondition(owner), targetCondition))
			.limit(1);

		const next = {
			enabled: patch.enabled === undefined ? (existing?.enabled ?? null) : patch.enabled,
			cadenceHours: patch.cadenceHours === undefined ? (existing?.cadenceHours ?? null) : patch.cadenceHours,
			samplesPerDispatch:
				patch.samplesPerDispatch === undefined ? (existing?.samplesPerDispatch ?? null) : patch.samplesPerDispatch,
		};
		const hasOverrides = Object.values(next).some((value) => value !== null);

		if (!hasOverrides) {
			if (existing) {
				await tx.delete(evaluationTargetScopeConfigs).where(eq(evaluationTargetScopeConfigs.id, existing.id));
				await bumpConfigurationVersion(tx);
				await addAuditLog(tx, {
					actorUserId,
					action: "evaluation_scope_config.deleted",
					owner,
					diff: { targetId: patch.targetId },
				});
			}
			return undefined;
		}

		const [result] = existing
			? await tx
					.update(evaluationTargetScopeConfigs)
					.set({ ...next, updatedAt: new Date() })
					.where(eq(evaluationTargetScopeConfigs.id, existing.id))
					.returning()
			: await tx
					.insert(evaluationTargetScopeConfigs)
					.values({ ...scopeOwnerValues(owner), targetId: patch.targetId, ...next })
					.returning();
		if (!result) throw new Error("Could not update evaluation scope configuration");

		await bumpConfigurationVersion(tx);
		await addAuditLog(tx, {
			actorUserId,
			action: "evaluation_scope_config.updated",
			owner,
			diff: { targetId: patch.targetId, ...next },
		});
		return result;
	});
}

export async function getEvaluationEntitlementLimits(organizationId?: string): Promise<EvaluationEntitlementLimits> {
	const conditions = [
		eq(evaluationEntitlements.scope, "instance"),
		...(organizationId
			? [
					and(
						eq(evaluationEntitlements.scope, "organization"),
						eq(evaluationEntitlements.organizationId, organizationId),
					),
				]
			: []),
	];
	const rows = await db
		.select()
		.from(evaluationEntitlements)
		.where(or(...conditions));
	const instance = rows.find((row) => row.scope === "instance");
	const organization = rows.find((row) => row.scope === "organization");
	const constrained = (field: keyof EvaluationEntitlementLimits): number | null => {
		const values = [instance?.[field], organization?.[field]].filter(
			(value): value is number => value !== null && value !== undefined,
		);
		return values.length > 0 ? Math.min(...values) : null;
	};
	return {
		maxConfiguredTargets: constrained("maxConfiguredTargets"),
		maxConfiguredTargetsPerBrand: constrained("maxConfiguredTargetsPerBrand"),
		maxConfiguredTargetsPerPrompt: constrained("maxConfiguredTargetsPerPrompt"),
		maxSamplesPerDispatch: constrained("maxSamplesPerDispatch"),
		maxRunsPerDay: constrained("maxRunsPerDay"),
	};
}

export async function updateEvaluationEntitlement(
	scope: "instance" | "organization",
	limits: EntitlementPatch,
	actorUserId?: string,
	organizationId?: string,
) {
	if (scope === "organization" && !organizationId)
		throw new Error("Organization entitlement requires an organization ID");

	return db.transaction(async (tx) => {
		await ensureInstanceSettingsInTransaction(tx);
		const condition =
			scope === "instance"
				? eq(evaluationEntitlements.scope, "instance")
				: and(
						eq(evaluationEntitlements.scope, "organization"),
						eq(evaluationEntitlements.organizationId, organizationId!),
					);
		const [existing] = await tx.select().from(evaluationEntitlements).where(condition).limit(1);
		const values = {
			maxConfiguredTargets: limits.maxConfiguredTargets,
			maxConfiguredTargetsPerBrand: limits.maxConfiguredTargetsPerBrand,
			maxConfiguredTargetsPerPrompt: limits.maxConfiguredTargetsPerPrompt,
			maxSamplesPerDispatch: limits.maxSamplesPerDispatch,
			maxRunsPerDay: limits.maxRunsPerDay,
		};
		const [result] = existing
			? await tx
					.update(evaluationEntitlements)
					.set({ ...values, updatedAt: new Date() })
					.where(eq(evaluationEntitlements.id, existing.id))
					.returning()
			: await tx
					.insert(evaluationEntitlements)
					.values({ scope, organizationId: scope === "organization" ? organizationId : null, ...values })
					.returning();
		if (!result) throw new Error("Could not update evaluation entitlement");

		await bumpConfigurationVersion(tx);
		await addAuditLog(tx, {
			actorUserId,
			action: "evaluation_entitlement.updated",
			owner: scope === "organization" ? { scope: "organization", organizationId: organizationId! } : undefined,
			diff: values,
		});
		return result;
	});
}

export async function getBrandOrganizationIdForEvaluation(brandId: string): Promise<string | undefined> {
	const [brand] = await db
		.select({ organizationId: brands.organizationId })
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	return brand?.organizationId;
}

export async function listEvaluationScopeConfigsForBrand(brandId: string) {
	const organizationId = await getBrandOrganizationIdForEvaluation(brandId);
	if (!organizationId) return [];
	return db
		.select()
		.from(evaluationTargetScopeConfigs)
		.where(
			or(
				and(
					eq(evaluationTargetScopeConfigs.scope, "organization"),
					eq(evaluationTargetScopeConfigs.organizationId, organizationId),
				),
				and(eq(evaluationTargetScopeConfigs.scope, "brand"), eq(evaluationTargetScopeConfigs.brandId, brandId)),
			),
		);
}
