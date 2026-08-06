/**
 * Public projection of the Elmo Cloud plan catalog for the marketing site.
 *
 * Numbers come straight from @workspace/config so the pricing page can never
 * drift from what is actually billed — change a plan in packages/config and
 * this page follows. Copy/positioning is intentionally minimal (plan facts
 * only); flesh it out in the component, not by hardcoding prices here.
 */
import { PLANS, PLAN_KEYS, type PlanKey } from "@workspace/config/plans";

/** Where the pricing CTAs send prospects. */
export const CLOUD_APP_URL = "https://app.elmohq.com";
export const CLOUD_SIGNUP_URL = `${CLOUD_APP_URL}/auth/register`;

export interface PublicCloudPlan {
	id: PlanKey;
	name: string;
	monthlyPriceUsd: number;
	annualPriceUsd: number;
	maxBrands: number;
	maxPrompts: number;
	platformPicks: number;
	standardRunsPerDay: number;
	claudeIncluded: number;
}

export const PUBLIC_CLOUD_PLANS: PublicCloudPlan[] = PLAN_KEYS.map((key) => {
	const plan = PLANS[key];
	return {
		id: key,
		name: plan.name,
		monthlyPriceUsd: plan.monthlyPriceUsd,
		annualPriceUsd: plan.annualPriceUsd,
		maxBrands: plan.maxBrands,
		maxPrompts: plan.maxPrompts,
		platformPicks: plan.platformPicks,
		standardRunsPerDay: plan.standardRunsPerDay,
		claudeIncluded: plan.claudeIncluded,
	};
});

/** Lowest self-serve monthly price, for "from $X/mo" copy. */
export const CLOUD_ENTRY_PRICE_USD = Math.min(...PUBLIC_CLOUD_PLANS.map((plan) => plan.monthlyPriceUsd));
