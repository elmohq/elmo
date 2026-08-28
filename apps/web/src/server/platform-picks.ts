/**
 * Server functions for the platform-picker UI (LLMs settings page, onboarding
 * wizard). Extracted from brands.ts so brand CRUD and platform/pick management
 * stay in separate files.
 */
import { createServerFn } from "@tanstack/react-start";
import { providersByModel } from "@workspace/config/scrape-targets";
import { getDefaultDelayHours, getRunsPerPrompt } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { assertAllowed, decideEnabledModels, getOrgEntitlements } from "@workspace/lib/entitlements";
import type { ModelConfig, ProviderAccess } from "@workspace/lib/providers";
import {
	describeProvider,
	isGroundedApiTarget,
	parseScrapeTargets,
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
	requireBrandAccess,
	requireOrgAccess,
	requirePlatformPicksEditable,
} from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";
import { expeditePromptRuns } from "@/lib/expedite-prompts";
import { addedPlatforms } from "@/lib/run-config-changes";

export type PlatformOption = {
	model: string;
	webSearch: boolean;
	/** Scraped consumer surface vs direct API call — shown as a pill. */
	access: ProviderAccess;
	/**
	 * Which vendor serves this target, and its model slug. Operator-only: which
	 * scraper sits behind ChatGPT is our plumbing, not something a cloud or
	 * whitelabel customer is buying, and it can change without affecting them.
	 * Withheld from the payload rather than merely hidden, so no UI change can
	 * leak it. The slug goes with it — an OpenRouter model id names OpenRouter.
	 */
	providerName?: string;
	version?: string;
	/**
	 * Rough USD per provider call. Operator-only for the same reason plus one
	 * more: it is what the deployment pays, which for whitelabel is the agency's
	 * margin.
	 */
	costPerRunUsd: number | null;
};

export type ModelPickerState = {
	/** Models this brand may choose from, with target metadata for display. */
	available: PlatformOption[];
	/** Whether the page offers checkboxes and a save bar. The one answer to "can
	 *  this be changed" — the page renders it, it does not re-derive it. */
	editable: boolean;
	/** The resolved list, never the raw `brands.enabledModels` column — null there
	 *  means "use the default", which the page once showed as "all platforms". */
	enabledModels: string[];
	/** Cloud plan constraints; null outside cloud (no pick limit). */
	planLimits: { platformPicks: number; platformMenu: string[] } | null;
	/**
	 * Platforms the plan menu excludes but the instance configures — what an
	 * upgrade would unlock. Empty outside cloud and on the top plan.
	 */
	upgradeOptions: PlatformOption[];
	/**
	 * What this brand's tracking currently costs to run, for projecting the price
	 * of a platform. Self-hosted only: in cloud and whitelabel the person looking
	 * pays a plan price rather than the provider bills, and these are internal
	 * attribution figures.
	 */
	costBasis: { enabledPrompts: number; runsPerDay: number; replication: number } | null;
	/**
	 * Self-hosted only: platforms Elmo can track that this instance has not
	 * configured, with the providers that can serve each and where to read how.
	 * Empty in cloud and whitelabel, where SCRAPE_TARGETS is the operator's
	 * concern rather than the viewer's.
	 */
	unconfiguredPlatforms: {
		model: string;
		/** Split by how each reaches the model: the two are not interchangeable. */
		providers: { id: string; name: string; access: ProviderAccess; docsUrl: string }[];
	}[];
};

export type OnboardingPlatformState = {
	available: ModelPickerState["available"];
	platformPicks: number;
	/** What brand creation would pick on its own; the wizard pre-selects these. */
	defaultSelected: string[];
} | null;

/**
 * `forOperator` is the one predicate behind everything a customer shouldn't see:
 * the deployment's vendors and what they cost. True only when the person looking
 * runs the deployment.
 */
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
 * One option per model, in SCRAPE_TARGETS order. Picks are stored by model name
 * (`brands.enabledModels`), so two targets for the same model can never be
 * chosen independently — offering both would render duplicate rows whose
 * checkboxes moved together.
 *
 * `excludePremium` is set in cloud, where a grounded API call is a pooled
 * per-prompt allowance rather than a pick. Self-hosted has no pool, so it keeps
 * whichever target is configured first for each model.
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

/**
 * Provider spend is only the viewer's concern when they run the deployment.
 * Whitelabel is excluded deliberately: the agency pays the bills, but the person
 * looking at this page is their customer.
 */
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

/**
 * Trackable platforms this instance has no target for. Derived from the combos
 * the provider status workflow exercises, so every suggestion is one we know
 * works, and ordered to match the picker above.
 */
function unconfiguredPlatforms(configs: ModelConfig[]): ModelPickerState["unconfiguredPlatforms"] {
	const configured = new Set(configs.map((config) => config.model));
	const suggestions: ModelPickerState["unconfiguredPlatforms"] = [];
	for (const [model, providerIds] of providersByModel()) {
		if (configured.has(model)) continue;
		suggestions.push({ model, providers: providerIds.map(describeProvider) });
	}
	return suggestions;
}

/**
 * Whether the viewer decides this brand's picks. Beyond the deployment gate,
 * "editable" also means there is something to change: a plan that pays for one
 * platform and offers one has nothing to offer, and unticking it would leave
 * zero, which the save bar refuses anyway.
 */
function picksEditable(available: PlatformOption[], picks: number | null): boolean {
	if (!canEditPlatformPicks()) return false;
	if (available.length === 0) return false;
	return !(picks === 1 && available.length === 1);
}

export const getModelPickerStateFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<ModelPickerState> => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new Error("Brand not found");

		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);
		const entitlements = await getOrgEntitlements(brand.organizationId);

		// Self-hosted offers every configured target, grounded ones included:
		// there is no pool to reserve it for.
		if (entitlements.unlimited) {
			const selfHosted = await selfHostedCostBasis(brand);
			const available = optionsByModel(configs, { forOperator: selfHosted !== null, excludePremium: false });
			return {
				available,
				editable: picksEditable(available, null),
				enabledModels: brand.enabledModels ?? available.map((option) => option.model),
				planLimits: null,
				upgradeOptions: [],
				costBasis: selfHosted,
				unconfiguredPlatforms: selfHosted !== null ? unconfiguredPlatforms(configs) : [],
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
		};
	});

/**
 * Platform choices for the brand onboarding wizard, resolved from the
 * organization because the brand row does not exist yet. Null — non-cloud,
 * unlimited entitlements, or nothing offerable — means the wizard skips the
 * step and creation falls back to the plan defaults.
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
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		requirePlatformPicksEditable();

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new Error("Brand not found");

		const models = data.models === null ? null : [...new Set(data.models)];
		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

		// Both branches below need the entitlements, so load them once and decide
		// in-process rather than going through assertEnabledModelsAllowed, which
		// would load them again.
		const entitlements = await getOrgEntitlements(brand.organizationId);

		if (models === null) {
			if (!entitlements.unlimited) {
				throw new Error("Choose which platforms to track — your plan defines how many.");
			}
		} else {
			// Loud validation against the configured targets (same rule the worker
			// applies), so a typo can't silently stop tracking.
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
