import { formatScrapeTarget, parseScrapeTargets, type ModelConfig } from "@workspace/config/scrape-targets";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { RUNS_PER_PROMPT, getDefaultDelayHours } from "../constants";
import { db } from "../db/db";
import {
	brands,
	evaluationTargetScopeConfigs,
	evaluationTargets,
	instanceSettings,
	prompts,
	providerConnections,
} from "../db/schema";
import { getProvider } from "../providers";
import { minimumCadenceHours, resolveEffectiveEvaluationTargets } from "./resolver";
import type {
	EffectiveEvaluationTarget,
	EvaluationTargetForResolution,
	EvaluationTargetScopeConfigForResolution,
} from "./types";

export type LegacyBootstrapStatus =
	| "bootstrapped"
	| "already-bootstrapped"
	| "no-legacy-config"
	| "skipped-existing-config";

export interface LegacyBootstrapResult {
	status: LegacyBootstrapStatus;
	targetCount: number;
}

export interface EnsureEvaluationConfigOptions {
	env?: Record<string, string | undefined>;
}

interface PromptContext {
	promptId: string;
	brandId: string;
	organizationId: string;
}

function legacyProviderConnectionKey(provider: string): string {
	return `legacy-env:${provider}`;
}

function legacyTargetKey(config: ModelConfig): string {
	return `legacy:${formatScrapeTarget(config)}`;
}

function getLegacyTargets(env: Record<string, string | undefined>): ModelConfig[] | null {
	const raw = env.SCRAPE_TARGETS;
	if (!raw || !raw.trim()) return null;
	return parseScrapeTargets(raw);
}

function isReadOnlyDeployment(env: Record<string, string | undefined>): boolean {
	return env.DEPLOYMENT_MODE === "demo" || env.READ_ONLY === "true";
}

async function ensureInstanceSettings(): Promise<void> {
	await db.insert(instanceSettings).values({ id: "default" }).onConflictDoNothing();
}

/**
 * Imports an existing SCRAPE_TARGETS deployment once, preserving the current
 * brand-level enabled-model and cadence behavior as scoped rows. Once a real
 * target exists, this importer deliberately stops: an environment variable can
 * never overwrite configuration that an operator has edited in the database.
 */
export async function bootstrapLegacyEvaluationConfig(
	options: EnsureEvaluationConfigOptions = {},
): Promise<LegacyBootstrapResult> {
	const env = options.env ?? process.env;
	if (isReadOnlyDeployment(env)) return { status: "no-legacy-config", targetCount: 0 };
	const legacyTargets = getLegacyTargets(env);

	await ensureInstanceSettings();
	if (!legacyTargets) return { status: "no-legacy-config", targetCount: 0 };

	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('elmo:evaluation-config:legacy-bootstrap'))`);

		const [instance] = await tx
			.select({ legacyBootstrapAt: instanceSettings.legacyBootstrapAt })
			.from(instanceSettings)
			.where(eq(instanceSettings.id, "default"))
			.limit(1);

		if (instance?.legacyBootstrapAt) {
			const existing = await tx.select({ id: evaluationTargets.id }).from(evaluationTargets);
			return { status: "already-bootstrapped", targetCount: existing.length };
		}

		const existingTargets = await tx.select({ id: evaluationTargets.id }).from(evaluationTargets).limit(1);
		if (existingTargets.length > 0) {
			await tx
				.update(instanceSettings)
				.set({ legacyBootstrapAt: new Date(), updatedAt: new Date() })
				.where(eq(instanceSettings.id, "default"));
			const allTargets = await tx.select({ id: evaluationTargets.id }).from(evaluationTargets);
			return { status: "skipped-existing-config", targetCount: allTargets.length };
		}

		const providerKeys = [...new Set(legacyTargets.map((target) => target.provider))];
		await tx
			.insert(providerConnections)
			.values(
				providerKeys.map((provider) => ({
					key: legacyProviderConnectionKey(provider),
					provider,
					credentialSource: "legacy_env" as const,
					credentialReference: { source: "environment" },
				})),
			)
			.onConflictDoNothing();

		const connections = await tx
			.select({ id: providerConnections.id, provider: providerConnections.provider })
			.from(providerConnections)
			.where(inArray(providerConnections.key, providerKeys.map(legacyProviderConnectionKey)));
		const connectionIdByProvider = new Map(connections.map((connection) => [connection.provider, connection.id]));

		const defaultCadenceHours = getDefaultDelayHours();
		await tx
			.insert(evaluationTargets)
			.values(
				legacyTargets.map((target) => {
					const providerConnectionId = connectionIdByProvider.get(target.provider);
					if (!providerConnectionId) {
						throw new Error(`Could not create provider connection for ${target.provider}`);
					}
					return {
						key: legacyTargetKey(target),
						model: target.model,
						providerConnectionId,
						version: target.version,
						webSearch: target.webSearch,
						defaultCadenceHours,
						defaultSamplesPerDispatch: RUNS_PER_PROMPT,
					};
				}),
			)
			.onConflictDoNothing();

		const targets = await tx
			.select({ id: evaluationTargets.id, model: evaluationTargets.model, key: evaluationTargets.key })
			.from(evaluationTargets)
			.where(inArray(evaluationTargets.key, legacyTargets.map(legacyTargetKey)));

		const existingBrands = await tx
			.select({ id: brands.id, delayOverrideHours: brands.delayOverrideHours, enabledModels: brands.enabledModels })
			.from(brands);
		const configuredModels = new Set(legacyTargets.map((target) => target.model));
		for (const brand of existingBrands) {
			const unknownModels = brand.enabledModels?.filter((model) => !configuredModels.has(model)) ?? [];
			if (unknownModels.length > 0) {
				throw new Error(
					`brand.enabledModels references models not in SCRAPE_TARGETS: ${unknownModels.join(", ")}. ` +
						`Configured models: ${[...configuredModels].join(", ") || "(none)"}.`,
				);
			}
		}
		const legacyScopeRows = existingBrands.flatMap((brand) => {
			const rows: Array<typeof evaluationTargetScopeConfigs.$inferInsert> = [];
			if (brand.delayOverrideHours !== null) {
				rows.push({
					scope: "brand",
					brandId: brand.id,
					cadenceHours: brand.delayOverrideHours,
				});
			}
			if (brand.enabledModels !== null) {
				for (const target of targets) {
					rows.push({
						scope: "brand",
						brandId: brand.id,
						targetId: target.id,
						enabled: brand.enabledModels.includes(target.model),
					});
				}
			}
			return rows;
		});

		if (legacyScopeRows.length > 0) {
			await tx.insert(evaluationTargetScopeConfigs).values(legacyScopeRows).onConflictDoNothing();
		}

		await tx
			.update(instanceSettings)
			.set({
				legacyBootstrapAt: new Date(),
				configurationVersion: sql`${instanceSettings.configurationVersion} + 1`,
				updatedAt: new Date(),
			})
			.where(eq(instanceSettings.id, "default"));

		return { status: "bootstrapped", targetCount: targets.length };
	});
}

export async function ensureEvaluationConfig(
	options: EnsureEvaluationConfigOptions = {},
): Promise<LegacyBootstrapResult> {
	const env = options.env ?? process.env;
	if (isReadOnlyDeployment(env)) return { status: "no-legacy-config", targetCount: 0 };
	await ensureInstanceSettings();
	const [instance] = await db
		.select({ legacyBootstrapAt: instanceSettings.legacyBootstrapAt })
		.from(instanceSettings)
		.where(eq(instanceSettings.id, "default"))
		.limit(1);
	if (instance?.legacyBootstrapAt) return { status: "already-bootstrapped", targetCount: 0 };
	return bootstrapLegacyEvaluationConfig({ ...options, env });
}

async function getResolutionTargets(): Promise<EvaluationTargetForResolution[]> {
	const rows = await db
		.select({
			id: evaluationTargets.id,
			key: evaluationTargets.key,
			model: evaluationTargets.model,
			provider: providerConnections.provider,
			providerConnectionId: evaluationTargets.providerConnectionId,
			providerConnectionEnabled: providerConnections.enabled,
			version: evaluationTargets.version,
			webSearch: evaluationTargets.webSearch,
			enabled: evaluationTargets.enabled,
			requiresPromptAssignment: evaluationTargets.requiresPromptAssignment,
			defaultCadenceHours: evaluationTargets.defaultCadenceHours,
			defaultSamplesPerDispatch: evaluationTargets.defaultSamplesPerDispatch,
		})
		.from(evaluationTargets)
		.innerJoin(providerConnections, eq(evaluationTargets.providerConnectionId, providerConnections.id));

	return rows;
}

async function getScopeConfigsForContexts(
	contexts: readonly PromptContext[],
): Promise<EvaluationTargetScopeConfigForResolution[]> {
	const organizationIds = [...new Set(contexts.map((context) => context.organizationId))];
	const brandIds = [...new Set(contexts.map((context) => context.brandId))];
	const promptIds = [...new Set(contexts.map((context) => context.promptId))];
	const conditions = [
		organizationIds.length > 0
			? and(
					eq(evaluationTargetScopeConfigs.scope, "organization"),
					inArray(evaluationTargetScopeConfigs.organizationId, organizationIds),
				)
			: undefined,
		brandIds.length > 0
			? and(eq(evaluationTargetScopeConfigs.scope, "brand"), inArray(evaluationTargetScopeConfigs.brandId, brandIds))
			: undefined,
		promptIds.length > 0
			? and(eq(evaluationTargetScopeConfigs.scope, "prompt"), inArray(evaluationTargetScopeConfigs.promptId, promptIds))
			: undefined,
	].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

	if (conditions.length === 0) return [];
	return db
		.select()
		.from(evaluationTargetScopeConfigs)
		.where(or(...conditions));
}

async function getPromptContexts(promptIds: readonly string[]): Promise<PromptContext[]> {
	if (promptIds.length === 0) return [];
	return db
		.select({
			promptId: prompts.id,
			brandId: brands.id,
			organizationId: brands.organizationId,
		})
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(inArray(prompts.id, [...new Set(promptIds)]));
}

/**
 * Single read path used by workers and UI: each prompt gets the fully resolved
 * instance → organization → brand → prompt target list in one batch of queries.
 */
export async function getEffectiveEvaluationTargetsForPrompts(
	promptIds: readonly string[],
): Promise<Map<string, EffectiveEvaluationTarget[]>> {
	await ensureEvaluationConfig();
	const contexts = await getPromptContexts(promptIds);
	const result = new Map<string, EffectiveEvaluationTarget[]>();
	if (contexts.length === 0) return result;

	const [targets, scopeConfigs] = await Promise.all([getResolutionTargets(), getScopeConfigsForContexts(contexts)]);
	for (const context of contexts) {
		result.set(context.promptId, resolveEffectiveEvaluationTargets(targets, scopeConfigs, context));
	}
	return result;
}

export async function getEffectiveEvaluationTargetsForPrompt(promptId: string): Promise<EffectiveEvaluationTarget[]> {
	const targets = await getEffectiveEvaluationTargetsForPrompts([promptId]);
	return targets.get(promptId) ?? [];
}

export async function getEffectiveEvaluationTargetsForBrand(brandId: string): Promise<EffectiveEvaluationTarget[]> {
	await ensureEvaluationConfig();
	const [brand] = await db
		.select({ brandId: brands.id, organizationId: brands.organizationId })
		.from(brands)
		.where(eq(brands.id, brandId))
		.limit(1);
	if (!brand) return [];

	const context: PromptContext = { ...brand, promptId: "" };
	const [targets, scopeConfigs] = await Promise.all([getResolutionTargets(), getScopeConfigsForContexts([context])]);
	return resolveEffectiveEvaluationTargets(targets, scopeConfigs, brand);
}

export async function getEffectiveEvaluationTargetsForInstance(): Promise<EffectiveEvaluationTarget[]> {
	await ensureEvaluationConfig();
	return resolveEffectiveEvaluationTargets(await getResolutionTargets(), [], {});
}

export async function getPromptCadenceHours(promptId: string): Promise<number | undefined> {
	return minimumCadenceHours(await getEffectiveEvaluationTargetsForPrompt(promptId));
}

/**
 * Validate only runnable database targets. Credentials backed by the legacy
 * environment preserve the old provider checks; encrypted and external
 * references fail closed until their runtime resolver is configured.
 */
export async function validateConfiguredEvaluationTargets(): Promise<void> {
	await ensureEvaluationConfig();
	const rows = await db
		.select({
			key: evaluationTargets.key,
			model: evaluationTargets.model,
			provider: providerConnections.provider,
			credentialSource: providerConnections.credentialSource,
			version: evaluationTargets.version,
			webSearch: evaluationTargets.webSearch,
			enabled: evaluationTargets.enabled,
			connectionEnabled: providerConnections.enabled,
		})
		.from(evaluationTargets)
		.innerJoin(providerConnections, eq(evaluationTargets.providerConnectionId, providerConnections.id))
		.where(and(eq(evaluationTargets.enabled, true), eq(providerConnections.enabled, true)));

	for (const target of rows) {
		if (target.credentialSource !== "legacy_env") {
			throw new Error(
				`Evaluation target "${target.key}" uses ${target.credentialSource} credentials, but no runtime credential resolver is configured`,
			);
		}

		const provider = getProvider(target.provider);
		if (!provider.isConfigured()) {
			throw new Error(`Evaluation target "${target.key}" requires credentials for provider "${target.provider}"`);
		}

		const config: ModelConfig = {
			model: target.model,
			provider: target.provider,
			version: target.version ?? undefined,
			webSearch: target.webSearch,
		};
		if (
			(target.provider === "openai-api" ||
				target.provider === "anthropic-api" ||
				target.provider === "mistral-api" ||
				target.provider === "openrouter") &&
			!config.version
		) {
			throw new Error(`Evaluation target "${target.key}" requires a version`);
		}

		const targetError = provider.validateTarget?.(config);
		if (targetError) throw new Error(`Evaluation target "${target.key}" is invalid: ${targetError}`);
	}
}
