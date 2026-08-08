/**
 * Server functions for the platform-picker UI (LLMs settings page, onboarding
 * wizard). Extracted from brands.ts so brand CRUD and platform/pick management
 * stay in separate files.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import {
	decideEnabledModels,
	EntitlementError,
	getOrgEntitlements,
} from "@workspace/lib/entitlements";
import type { ModelConfig } from "@workspace/lib/providers";
import { parseScrapeTargets, selectTargetsForBrand } from "@workspace/lib/providers";
import { defaultPlatformPicks } from "@workspace/lib/run-policy";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess, requireOrgAccess } from "@/lib/auth/helpers";
import { getDeployment } from "@/lib/config/server";

export type ModelPickerState = {
	/** Models this brand may choose from, with target metadata for display. */
	available: { model: string; provider: string; version?: string; webSearch: boolean }[];
	/** The brand's stored picks; null = follow deployment configuration. */
	enabledModels: string[] | null;
	/** Cloud plan constraints; null outside cloud (no pick limit). */
	planLimits: { platformPicks: number; platformMenu: string[] } | null;
};

export type OnboardingPlatformState = {
	available: ModelPickerState["available"];
	platformPicks: number;
	/** What brand creation would pick on its own; the wizard pre-selects these. */
	defaultSelected: string[];
} | null;

/**
 * The plan menu (plus custom extras) that this instance actually configures,
 * deduped by model. Claude is deliberately never offered — it is not a
 * platform pick and has its own per-prompt assignment surface.
 */
function planPlatformOptions(platformMenu: string[] | null, configs: ModelConfig[]): ModelPickerState["available"] {
	const menu = new Set(platformMenu ?? []);
	const seen = new Set<string>();
	const available: ModelPickerState["available"] = [];
	for (const config of configs) {
		if (!menu.has(config.model) || seen.has(config.model)) continue;
		seen.add(config.model);
		available.push({
			model: config.model,
			provider: config.provider,
			version: config.version,
			webSearch: config.webSearch,
		});
	}
	return available;
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

		if (entitlements.unlimited) {
			return {
				available: configs.map(({ model, provider, version, webSearch }) => ({ model, provider, version, webSearch })),
				enabledModels: brand.enabledModels,
				planLimits: null,
			};
		}

		const available = planPlatformOptions(entitlements.platformMenu, configs);
		return {
			available,
			enabledModels: brand.enabledModels,
			planLimits: {
				platformPicks: entitlements.platformPicks ?? available.length,
				platformMenu: entitlements.platformMenu ?? [],
			},
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
		const available = planPlatformOptions(entitlements.platformMenu, configs);
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

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new Error("Brand not found");

		const models = data.models === null ? null : [...new Set(data.models)];
		const configs = parseScrapeTargets(process.env.SCRAPE_TARGETS);

		// Load entitlements once; use the pure decideEnabledModels (which
		// doesn't query the DB) instead of assertEnabledModelsAllowed (which
		// does) to avoid loading entitlements twice on the null-models path.
		const entitlements = await getOrgEntitlements(brand.organizationId);

		if (models !== null) {
			// Loud validation against the configured targets (same rule the worker
			// applies), so a typo can't silently stop tracking.
			selectTargetsForBrand(configs, models);
			if (!entitlements.unlimited) {
				const decision = decideEnabledModels(entitlements, models);
				if (!decision.allowed) throw new EntitlementError(decision.code, decision.message);
			}
		} else {
			if (!entitlements.unlimited) {
				throw new Error("Choose which platforms to track — your plan defines how many.");
			}
		}

		const [updated] = await db
			.update(brands)
			.set({ enabledModels: models, updatedAt: new Date() })
			.where(eq(brands.id, data.brandId))
			.returning({ id: brands.id, enabledModels: brands.enabledModels });
		if (!updated) throw new Error("Brand not found");
		return updated;
	});