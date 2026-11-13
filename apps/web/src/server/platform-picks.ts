import { createServerFn } from "@tanstack/react-start";
import {
	parseScrapeTargets,
	providersByModel,
	type RetiredScrapeTarget,
	retiredScrapeTargets,
} from "@workspace/config/scrape-targets";
import { getDeployment } from "@workspace/deployment";
import { getDefaultDelayHours, getRunsPerPrompt } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { assertAllowed, decideEnabledModels, getOrgEntitlements } from "@workspace/lib/entitlements";
import type { ModelConfig, ProviderAccess } from "@workspace/lib/providers";
import {
	describeProvider,
	isGroundedApiTarget,
	resolveProviderAccess,
	selectTargetsForBrand,
} from "@workspace/lib/providers";
import { defaultPlatformPicks, resolveBrandPicks } from "@workspace/lib/run-policy";
import { estimateRunCostUsd } from "@workspace/lib/usage";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import {
	canEditPlatformPicks,
	requireAuthSession,
	requireBrandSession,
	requireOrgAccess,
	requirePlatformPicksEditable,
} from "@/lib/auth/helpers";
import { expeditePromptRuns } from "@/lib/expedite-prompts";
import { addedPlatforms } from "@/lib/run-config-changes";

export type PlatformOption = {
	model: string;
	webSearch: boolean;
	/** Scraped consumer surface vs direct API call — shown as a pill. */
	access: ProviderAccess;
	/**
	 * Operator-only, and withheld from the payload rather than hidden: which vendor
	 * serves a platform is our plumbing. The slug goes too, since it can name the vendor.
	 */
	providerName?: string;
	version?: string;
	/** Operator-only: what the deployment pays, which for whitelabel is the agency's margin. */
	costPerRunUsd: number | null;
};

export type ModelPickerState = {
	available: PlatformOption[];
	/** The page renders this rather than re-deriving whether picks can change. */
	editable: boolean;
	/** Resolved, never the raw `brands.enabledModels`, where null means "use the default". */
	enabledModels: string[];
	/** Null outside cloud, where there is no pick limit. */
	planLimits: { platformPicks: number; platformMenu: string[] } | null;
	/** Configured platforms the plan menu excludes: what an upgrade would unlock. */
	upgradeOptions: PlatformOption[];
	/** Self-hosted only: elsewhere the viewer pays a plan price, not the provider bills. */
	costBasis: { enabledPrompts: number; runsPerDay: number; replication: number } | null;
	/** Self-hosted only: elsewhere SCRAPE_TARGETS is the operator's concern, not the viewer's. */
	unconfiguredPlatforms: {
		model: string;
		/** Split by how each reaches the model: the two are not interchangeable. */
		providers: { id: string; name: string; access: ProviderAccess; docsUrl: string }[];
	}[];
	/** Self-hosted only: SCRAPE_TARGETS entries the instance skips, which only the server log mentions otherwise. */
	retiredTargets: RetiredScrapeTarget[];
};

export type OnboardingPlatformState = {
	available: ModelPickerState["available"];
	platformPicks: number;
	/** What brand creation would pick on its own; the wizard pre-selects these. */
	defaultSelected: string[];
} | null;

/** `forOperator` gates everything a customer shouldn't see: the deployment's vendors and their cost. */
function toOption(config: ModelConfig, forOperator: boolean): PlatformOption {
	const shared = {
		model: config.model,
		webSearch: config.webSearch,
		access: resolveProviderAccess(config),
	};
	if (!forOperator) return { ...shared, costPerRunUsd: null };
	return {
		...shared,
		providerName: describeProvider(config.provider).name,
		version: config.version,
		costPerRunUsd: estimateRunCostUsd(config.provider, config.webSearch),
	};
}

/**
 * One option per model: picks are stored by model name, so two targets for the
 * same model could only ever be ticked together. In cloud a grounded call comes
 * from the premium pool, not a pick, hence `excludePremium`.
 */
function optionsByModel(
	configs: ModelConfig[],
	{ forOperator, excludePremium }: { forOperator: boolean; excludePremium: boolean },
): PlatformOption[] {
	const seen = new Set<string>();
	const options: PlatformOption[] = [];
	for (const config of configs) {
		if (excludePremium && isGroundedApiTarget(config)) continue;
		if (seen.has(config.model)) continue;
		seen.add(config.model);
		options.push(toOption(config, forOperator));
	}
	return options;
}

/** Not whitelabel: the agency pays the bills, but the person looking is their customer. */
async function selfHostedCostBasis(brand: {
	id: string;
	delayOverrideHours: number | null;
}): Promise<ModelPickerState["costBasis"]> {
	if (getDeployment().mode !== "local") return null;

	const [row] = await db
		.select({ value: count() })
		.from(prompts)
		.where(and(eq(prompts.brandId, brand.id), eq(prompts.enabled, true)));

	const delayHours = brand.delayOverrideHours ?? getDefaultDelayHours();
	return {
		enabledPrompts: row?.value ?? 0,
		runsPerDay: 24 / Math.max(1, delayHours),
		replication: getRunsPerPrompt(),
	};
}

/** Drawn from the combos the provider status workflow exercises, so every suggestion is known to work. */
function unconfiguredPlatforms(configs: ModelConfig[]): ModelPickerState["unconfiguredPlatforms"] {
	const configured = new Set(configs.map((config) => config.model));
	const suggestions: ModelPickerState["unconfiguredPlatforms"] = [];
	for (const [model, providerIds] of providersByModel()) {
		if (configured.has(model)) continue;
		suggestions.push({ model, providers: providerIds.map(describeProvider) });
	}
	return suggestions;
}

/** One platform paid for and one offered leaves nothing to change, so that isn't editable either. */
function picksEditable(available: PlatformOption[], picks: number | null): boolean {
	if (!canEditPlatformPicks()) return false;
	if (available.length === 0) return false;
	return !(picks === 1 && available.length === 1);
}

export const getModelPickerStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<ModelPickerState> => {
		await requireBrandSession(data.brandId);

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new Error("Brand not found");

		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);
		const entitlements = await getOrgEntitlements(brand.organizationId);

		// Self-hosted offers every configured target, grounded ones included:
		// there is no pool to reserve it for.
		if (entitlements.unlimited) {
			const selfHosted = await selfHostedCostBasis(brand);
			const available = optionsByModel(configs, { forOperator: selfHosted !== null, excludePremium: false });
			const models = available.map((option) => option.model);
			return {
				available,
				editable: picksEditable(available, null),
				// A pick whose target is gone has no checkbox, so it could never be cleared.
				enabledModels: models.filter((model) => brand.enabledModels?.includes(model) ?? true),
				planLimits: null,
				upgradeOptions: [],
				costBasis: selfHosted,
				unconfiguredPlatforms: selfHosted !== null ? unconfiguredPlatforms(configs) : [],
				retiredTargets: selfHosted !== null ? retiredScrapeTargets(process.env.SCRAPE_TARGETS) : [],
			};
		}

		const pickable = optionsByModel(configs, { forOperator: false, excludePremium: true });
		const menu = new Set(entitlements.platformMenu ?? []);
		const available = pickable.filter((option) => menu.has(option.model));
		const picks = entitlements.platformPicks ?? available.length;
		return {
			available,
			editable: picksEditable(available, picks),
			enabledModels: resolveBrandPicks(entitlements, brand, configs),
			planLimits: {
				platformPicks: picks,
				platformMenu: entitlements.platformMenu ?? [],
			},
			upgradeOptions: pickable.filter((option) => !menu.has(option.model)),
			costBasis: null,
			unconfiguredPlatforms: [],
			retiredTargets: [],
		};
	});

/**
 * Resolved from the organization, since the brand doesn't exist yet. Null means
 * the wizard skips the step and creation falls back to the plan defaults.
 */
export const getOnboardingPlatformStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ organizationId: z.string() }))
	.handler(async ({ data }): Promise<OnboardingPlatformState> => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.organizationId);

		if (getDeployment().mode !== "cloud") return null;
		const entitlements = await getOrgEntitlements(data.organizationId);
		if (entitlements.unlimited) return null;

		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);
		const menu = new Set(entitlements.platformMenu ?? []);
		const available = optionsByModel(configs, { forOperator: false, excludePremium: true }).filter((option) =>
			menu.has(option.model),
		);
		if (available.length === 0) return null;

		return {
			available,
			platformPicks: entitlements.platformPicks ?? available.length,
			defaultSelected: defaultPlatformPicks(entitlements, configs),
		};
	});

export const updateEnabledModelsFn = createServerFn({ method: "POST" })
	.validator(
		z.object({
			brandId: z.string(),
			/** Explicit picks, or null to follow the deployment configuration. */
			models: z.array(z.string().min(1)).max(50).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);

		requirePlatformPicksEditable();

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new Error("Brand not found");

		const models = data.models === null ? null : [...new Set(data.models)];
		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

		// Loaded once for both branches; assertEnabledModelsAllowed would load them again.
		const entitlements = await getOrgEntitlements(brand.organizationId);

		if (models === null) {
			if (!entitlements.unlimited) {
				throw new Error("Choose which platforms to track — your plan defines how many.");
			}
		} else {
			// Throws on an unconfigured model, so a typo can't silently stop tracking.
			selectTargetsForBrand(configs, models);
			if (!entitlements.unlimited) assertAllowed(decideEnabledModels(entitlements, models));
		}

		const [updated] = await db
			.update(brands)
			.set({ enabledModels: models, updatedAt: new Date() })
			.where(eq(brands.id, data.brandId))
			.returning({ id: brands.id, enabledModels: brands.enabledModels });
		if (!updated) throw new Error("Brand not found");

		// A newly picked platform has no run history, so do not make it wait for
		// each prompt's already-scheduled next job.
		const added = addedPlatforms(
			brand.enabledModels,
			models,
			configs.map((config) => config.model),
		);
		if (added.length > 0) {
			const enabled = await db
				.select({ id: prompts.id })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)));
			await expeditePromptRuns(enabled.map((prompt) => prompt.id));
		}

		return updated;
	});
