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
import { localesInUse } from "@/lib/prompt-scope";

function toMarketTarget(plan: TargetPlan, showCost: boolean): MarketTarget {
	const { config } = plan;
	const handlingOf = (country: string) => describeMarketHandling(config, { ...DEFAULT_MARKET, country });
	return {
		value: targetFilterValue(config.model, isGroundedApiTarget(config)),
		runsPerDay: 24 / plan.intervalHours,
		replication: plan.replication,
		locationFree: handlingOf(DEFAULT_MARKET.country).country === "location-free",
		defaultLocationCountries: COUNTRIES.filter(
			(country) => handlingOf(country.code).country === "provider-default",
		).map((country) => country.code),
		sendsLanguage: handlingOf(DEFAULT_MARKET.country).sendsLanguage,
		costPerRunUsd: showCost ? estimateRunCostUsd(config.provider, config.webSearch) : null,
	};
}

/** A bad SCRAPE_TARGETS already fails boot validation. */
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
			db
				.select({ enabled: prompts.enabled, country: prompts.country, language: prompts.language })
				.from(prompts)
				.where(eq(prompts.brandId, data.brandId)),
		]);

		const targets = plannedTargets(() =>
			resolvePromptRunPlan({
				scrapeTargets: parseScrapeTargets(process.env.SCRAPE_TARGETS),
				brand,
				// What every prompt runs on. A premium pairing is one prompt's own addition.
				prompt: { premiumModels: [] },
				entitlements,
				defaultDelayHours: getDefaultDelayHours(),
			}),
		);

		// Not whitelabel: the agency pays the bills, but the person looking is their customer.
		const showCost = getDeployment().mode === "local";
		return {
			brandMarket: { country: brand.country, language: brand.language },
			countriesInUse: [
				...new Set([brand.country, ...localesInUse(brand, brandPrompts).countries.map((use) => use.code)]),
			],
			targets: targets.map((target) => toMarketTarget(target, showCost)),
			promptAllowance:
				entitlements.unlimited || entitlements.maxPrompts === null
					? null
					: { used: await countOrgEnabledPrompts(brand.organizationId), max: entitlements.maxPrompts },
		};
	});
