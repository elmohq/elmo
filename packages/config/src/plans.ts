/**
 * The Elmo Cloud plan catalog.
 *
 * This file is the single source of truth for what each cloud plan includes.
 * Billing (Stripe products/prices), write-time enforcement, the worker's run
 * policy, and the pricing/billing UI all consume these definitions — change a
 * number here and every layer follows.
 *
 * Stripe prices are referenced by lookup key (stripePlanLookupKey /
 * CLAUDE_ADDON_LOOKUP_KEYS) rather than per-environment price-ID env vars;
 * scripts/stripe/bootstrap.ts provisions any Stripe account (test or live)
 * with these exact keys.
 */

export type PlanKey = "starter" | "basic" | "pro" | "business";

export type BillingInterval = "monthly" | "annual";

/**
 * The standard platform menu: model names a cloud brand may pick as its
 * tracked platforms. Claude is deliberately absent —
 * Claude tracking is a per-prompt allowance (prompts.claude_mode), not a
 * platform pick. Custom-only targets (e.g. GPT-5 Search) are granted per org
 * via entitlement overrides, never through this menu.
 *
 * A menu entry is only offerable when the operator's SCRAPE_TARGETS actually
 * configures a target with that model name; the UI and run policy intersect
 * with the instance's configured targets.
 */
export const STANDARD_PLATFORM_MENU = [
	"chatgpt",
	"google-ai-mode",
	"google-ai-overview",
	"copilot",
	"perplexity",
	"gemini",
	"qwen",
	"deepseek",
] as const;

/** Claude tracking always samples once per day, on every plan. */
export const CLAUDE_RUNS_PER_DAY = 1;

/** Ceiling for custom-plan sampling overrides (research-grade). */
export const MAX_STANDARD_RUNS_PER_DAY = 7;

/** Dunning: how long past_due keeps tracking alive before it pauses. */
export const PAST_DUE_GRACE_DAYS = 7;

/** Extra Claude prompts add-on: $5/prompt/month, Pro and Business only. */
export const CLAUDE_ADDON_MONTHLY_USD = 5;

export interface PlanDefinition {
	key: PlanKey;
	name: string;
	monthlyPriceUsd: number;
	/** Annual = 10× monthly (two months free). */
	annualPriceUsd: number;
	/** Brands per organization. */
	maxBrands: number;
	/** Organization-wide pool of enabled (tracked) prompts. */
	maxPrompts: number;
	/** Which standard platforms this plan may choose from. */
	platformMenu: readonly string[];
	/** How many platforms a brand may have enabled at once. */
	platformPicks: number;
	/** Sampling frequency for standard platforms. */
	standardRunsPerDay: number;
	/** Claude tracking prompts included (assignable via prompts.claude_mode). */
	claudeIncluded: number;
	/** Whether the extra-Claude-prompts add-on can be purchased. */
	claudeAddonAvailable: boolean;
}

export const PLANS: Record<PlanKey, PlanDefinition> = {
	starter: {
		key: "starter",
		name: "Starter",
		monthlyPriceUsd: 29,
		annualPriceUsd: 290,
		maxBrands: 1,
		maxPrompts: 50,
		platformMenu: ["chatgpt"],
		platformPicks: 1,
		standardRunsPerDay: 1,
		claudeIncluded: 0,
		claudeAddonAvailable: false,
	},
	basic: {
		key: "basic",
		name: "Basic",
		monthlyPriceUsd: 99,
		annualPriceUsd: 990,
		maxBrands: 1,
		maxPrompts: 50,
		platformMenu: STANDARD_PLATFORM_MENU,
		platformPicks: 4,
		standardRunsPerDay: 4,
		claudeIncluded: 0,
		claudeAddonAvailable: false,
	},
	pro: {
		key: "pro",
		name: "Pro",
		monthlyPriceUsd: 299,
		annualPriceUsd: 2990,
		maxBrands: 2,
		maxPrompts: 150,
		platformMenu: STANDARD_PLATFORM_MENU,
		platformPicks: 4,
		standardRunsPerDay: 4,
		claudeIncluded: 20,
		claudeAddonAvailable: true,
	},
	business: {
		key: "business",
		name: "Business",
		monthlyPriceUsd: 649,
		annualPriceUsd: 6490,
		maxBrands: 5,
		maxPrompts: 350,
		platformMenu: STANDARD_PLATFORM_MENU,
		platformPicks: 4,
		standardRunsPerDay: 4,
		claudeIncluded: 30,
		claudeAddonAvailable: true,
	},
};

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

export function isPlanKey(value: string): value is PlanKey {
	return value in PLANS;
}

/**
 * Stripe price lookup key for a plan/interval. The @better-auth/stripe plugin
 * resolves these to price IDs at checkout time, so the same code works against
 * any Stripe account bootstrapped with scripts/stripe/bootstrap.ts.
 */
export function stripePlanLookupKey(plan: PlanKey, interval: BillingInterval): string {
	return `elmo_cloud_${plan}_${interval}`;
}

export const CLAUDE_ADDON_LOOKUP_KEYS: Record<BillingInterval, string> = {
	monthly: "elmo_cloud_claude_extra_monthly",
	annual: "elmo_cloud_claude_extra_annual",
};
