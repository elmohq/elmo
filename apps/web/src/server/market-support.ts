import { createServerFn } from "@tanstack/react-start";
import { COUNTRIES, DEFAULT_MARKET } from "@workspace/config/markets";
import { targetFilterValue } from "@workspace/config/model-filter";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getDeployment } from "@workspace/deployment";
import { getDefaultDelayHours } from "@workspace/lib/constants";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { countOrgEnabledPrompts, getOrgEntitlements } from "@workspace/lib/entitlements";
import { describeMarketHandling, isGroundedApiTarget } from "@workspace/lib/providers";
import { resolvePromptRunPlan, type TargetPlan } from "@workspace/lib/run-policy";
import { estimateRunCostUsd } from "@workspace/lib/usage";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import type { MarketSupport, MarketTarget } from "@/lib/market-support";

function toMarketTarget(plan: TargetPlan, showCost: boolean): MarketTarget {
	const { config } = plan;
	const handlingOf = (country: string) => describeMarketHandling(config, { ...DEFAULT_MARKET, country });
	return {
		value: targetFilterValue(config.model, isGroundedApiTarget(config)),
		runsPerDay: 24 / plan.intervalHours,
		replication: plan.replication,
		unsupportedCountries: COUNTRIES.filter((country) => !handlingOf(country.code).runs).map((country) => country.code),
		locationFree: handlingOf(DEFAULT_MARKET.country).country === "location-free",
		sendsLanguage: handlingOf(DEFAULT_MARKET.country).sendsLanguage,
		costPerRunUsd: showCost ? estimateRunCostUsd(config.provider, config.webSearch) : null,
	};
}

/** The plan the worker resolves, before any market rules a target out. A bad SCRAPE_TARGETS already fails boot validation. */
function plannedTargets(resolve: () => { targets: TargetPlan[] }): TargetPlan[] {
	try {
		return resolve().targets;
	} catch {
		return [];
	}
}

export const getMarketSupportFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string() }))
	.handler(async ({ data }): Promise<MarketSupport> => {
		await requireBrandSession(data.brandId);

		const brand = await db.query.brands.findFirst({ where: eq(brands.id, data.brandId) });
		if (!brand) throw new Error("Brand not found");

		const [entitlements, brandPrompts] = await Promise.all([
			getOrgEntitlements(brand.organizationId),
			db.select({ premiumModels: prompts.premiumModels }).from(prompts).where(eq(prompts.brandId, data.brandId)),
		]);

		const targets = plannedTargets(() =>
			resolvePromptRunPlan({
				scrapeTargets: parseScrapeTargets(process.env.SCRAPE_TARGETS),
				brand,
				prompt: { premiumModels: [...new Set(brandPrompts.flatMap((prompt) => prompt.premiumModels))] },
				entitlements,
				defaultDelayHours: getDefaultDelayHours(),
			}),
		);

		// Not whitelabel: the agency pays the bills, but the person looking is their customer.
		const showCost = getDeployment().mode === "local";
		return {
			brandMarket: { country: brand.country, language: brand.language },
			targets: targets.map((target) => toMarketTarget(target, showCost)),
			promptAllowance:
				entitlements.unlimited || entitlements.maxPrompts === null
					? null
					: { used: await countOrgEnabledPrompts(brand.organizationId), max: entitlements.maxPrompts },
		};
	});
