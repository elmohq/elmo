/**
 * The Elmo Cloud plan catalog: billing, write-time enforcement, the run policy
 * and the pricing UI all read it. Stripe prices are found by lookup key, which
 * packages/deployment/scripts/bootstrap-stripe.ts provisions in any account.
 */

import { getModelMeta } from "./models";
import { CLOUD_APP_URL } from "./referrals";

export type PlanKey = "starter" | "basic" | "pro" | "business";

export type BillingInterval = "monthly" | "annual";

/** Whether Elmo Cloud reaches a platform by scraping its product or calling an API. */
export type ProviderAccessKind = "scraped" | "api";

export interface CloudPlatform {
	/** Omitted when only sold grounded, like Grok, whose answers cost too much to sample as a pick. */
	access?: ProviderAccessKind;
	/**
	 * Also sold grounded (its own web search on), from the premium pool. A grounded
	 * call costs roughly ten times an ungrounded one, so it is metered per prompt.
	 */
	premium?: boolean;
	version?: string;
	premiumVersion?: string;
}

/**
 * What Elmo Cloud sells, not what Elmo can track; an entry is only offered when
 * SCRAPE_TARGETS configures a matching target.
 *
 * Order matters: defaultPlatformPicks takes a new brand's picks off the front, so
 * append new platforms rather than inserting them.
 */
export const CLOUD_PLATFORMS: Record<string, CloudPlatform> = {
	chatgpt: { access: "scraped", premium: true, premiumVersion: "GPT-6 Luna" },
	"google-ai-mode": { access: "scraped" },
	"google-ai-overview": { access: "scraped" },
	copilot: { access: "scraped" },
	perplexity: { access: "scraped" },
	gemini: { access: "scraped" },
	qwen: { access: "api", version: "Qwen3 235B A22B 2507" },
	deepseek: { access: "api", version: "DeepSeek V3.2" },
	grok: { premium: true, premiumVersion: "Grok 4.5" },
	mistral: { access: "api", version: "Mistral Medium 3.1" },
	claude: { access: "api", premium: true, version: "Claude Haiku 5.5", premiumVersion: "Claude Haiku 5.5" },
	kimi: { access: "api", version: "Kimi K2.5" },
};

export const STANDARD_PLATFORM_MENU: readonly string[] = Object.entries(CLOUD_PLATFORMS)
	.filter(([, platform]) => platform.access !== undefined)
	.map(([model]) => model);

/** Not a subset of the pick menu: a model too dear to sample as a pick can still be worth one grounded call. */
export const PREMIUM_MODELS: readonly string[] = ["claude", "chatgpt", "grok"];

/** The premium tier sells the grounded variant, which customers know by a different name. */
const PREMIUM_LABELS: Record<string, string> = {
	claude: "Claude (web)",
	chatgpt: "GPT Search",
	grok: "Grok (web)",
};

export function premiumModelLabel(model: string): string {
	return PREMIUM_LABELS[model] ?? getModelMeta(model).label;
}

/** Unknown entries are dropped rather than rejected: they should cost nothing, not fail a save. */
export function selectPremiumModels(requested: readonly string[] | undefined): string[] {
	if (!requested || requested.length === 0) return [];
	return PREMIUM_MODELS.filter((model) => requested.includes(model));
}

/**
 * One slot per premium model on each enabled prompt. The write guard, the
 * editor's live counter and the org total must agree, since customers are billed on it.
 */
export function premiumSlotsUsed(prompts: readonly { enabled: boolean; premiumModels: readonly string[] }[]): number {
	return prompts.reduce((total, prompt) => total + (prompt.enabled ? prompt.premiumModels.length : 0), 0);
}

/** Every grounded call is metered, so it samples once a day on every plan. */
export const PREMIUM_RUNS_PER_DAY = 1;

/** Ceiling for custom-plan sampling overrides (research-grade). */
export const MAX_STANDARD_RUNS_PER_DAY = 7;

/** Dunning: how long past_due keeps tracking alive before it pauses. */
export const PAST_DUE_GRACE_DAYS = 7;

/** Extra premium prompt/model slots, on the plans that sell the tier. */
export const PREMIUM_ADDON_MONTHLY_USD = 5;

export const PREMIUM_ADDON_ANNUAL_USD = PREMIUM_ADDON_MONTHLY_USD * 10;

export interface PlanDefinition {
	key: PlanKey;
	name: string;
	monthlyPriceUsd: number;
	annualPriceUsd: number;
	maxBrands: number;
	/** Enabled prompts, across all of the org's brands. */
	maxPrompts: number;
	platformMenu: readonly string[];
	/** Per brand. */
	platformPicks: number;
	standardRunsPerDay: number;
	/** Org-wide; one slot tracks one prompt on one premium model, grounded. */
	premiumIncluded: number;
	premiumAddonAvailable: boolean;
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
		premiumIncluded: 0,
		premiumAddonAvailable: false,
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
		premiumIncluded: 0,
		premiumAddonAvailable: false,
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
		premiumIncluded: 20,
		premiumAddonAvailable: true,
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
		premiumIncluded: 30,
		premiumAddonAvailable: true,
	},
};

/** Lets a guard tell a customer whether upgrading helps or they need a custom agreement. */
export const MAX_SELF_SERVE_BRANDS = Math.max(...Object.values(PLANS).map((plan) => plan.maxBrands));

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

export function isPlanKey(value: string): value is PlanKey {
	return value in PLANS;
}

export function sellsPremium(plan: PlanDefinition): boolean {
	return plan.premiumIncluded > 0 || plan.premiumAddonAvailable;
}

export function premiumPlanNames(): string {
	const names = Object.values(PLANS)
		.filter(sellsPremium)
		.map((plan) => plan.name);
	return new Intl.ListFormat("en", { type: "conjunction" }).format(names);
}

export function isPremiumAddonAvailable(planKey: PlanKey | "custom" | null): boolean {
	if (planKey === "custom") return true;
	return planKey !== null && PLANS[planKey].premiumAddonAvailable;
}

export function planDisplayName(planKey: PlanKey | "custom" | null): string {
	if (planKey === "custom") return "Custom";
	return planKey === null ? "None" : PLANS[planKey].name;
}

/** Resolved to a price ID at checkout, so one key works in any bootstrapped Stripe account. */
export function stripePlanLookupKey(plan: PlanKey, interval: BillingInterval): string {
	return `elmo_cloud_${plan}_${interval}`;
}

export const PREMIUM_ADDON_LOOKUP_KEYS: Record<BillingInterval, string> = {
	monthly: "elmo_cloud_premium_extra_monthly",
	annual: "elmo_cloud_premium_extra_annual",
};

export type PlanPlatformGroupId = "scraped" | "api" | "premium";

export const PLATFORM_TIER_LABELS: Record<PlanPlatformGroupId, string> = {
	scraped: "Scraped Engines",
	api: "LLM APIs",
	premium: "Premium LLM APIs",
};

export interface PlanPlatformMember {
	model: string;
	/** The premium tier names the grounded variant. */
	label: string;
	/** Resolved here so the shared tier renderer stays free of the catalog. */
	iconId: string;
	tooltip?: string;
}

function premiumVersionLabel(version: string | undefined): string | undefined {
	return version && `${version} + native web search`;
}

function tierMember(model: string, tier: PlanPlatformGroupId): PlanPlatformMember {
	const premium = tier === "premium";
	return {
		model,
		label: premium ? premiumModelLabel(model) : getModelMeta(model).label,
		iconId: getModelMeta(model).iconId,
		tooltip: premium ? premiumVersionLabel(CLOUD_PLATFORMS[model]?.premiumVersion) : CLOUD_PLATFORMS[model]?.version,
	};
}

/** Across all plans, for prose that names a tier's platforms, so new entries can't leave it stale. */
export function platformTierMembers(tier: PlanPlatformGroupId): PlanPlatformMember[] {
	const models =
		tier === "premium"
			? PREMIUM_MODELS
			: STANDARD_PLATFORM_MENU.filter((model) => CLOUD_PLATFORMS[model]?.access === tier);
	return models.map((model) => tierMember(model, tier));
}

export interface PlanPlatformGroup {
	id: PlanPlatformGroupId;
	label: string;
	runsPerDay: number;
	models: PlanPlatformMember[];
}

export interface PlanPlatformBreakdown {
	pickHeading: string;
	/** All spend the same `platformPicks` budget, so a table shouldn't list any as extra. */
	pickGroups: PlanPlatformGroup[];
	/**
	 * Chosen per prompt on top of the brand's picks, spending the premium pool.
	 * Shaped like a pick group so tables render all tiers alike; null when not sold.
	 */
	premium:
		| (PlanPlatformGroup & {
				includedSlots: number;
				addonAvailable: boolean;
				summary: string;
		  })
		| null;
}

/**
 * A model can be both a pick and premium: the two buy different answers (what it
 * already believes versus what it finds and cites), and either sells alone.
 */
export function planPlatformBreakdown(plan: PlanDefinition): PlanPlatformBreakdown {
	const inTier = (access: ProviderAccessKind): PlanPlatformMember[] =>
		plan.platformMenu
			.filter((model) => CLOUD_PLATFORMS[model]?.access === access)
			.map((model) => tierMember(model, access));

	const groups: PlanPlatformGroup[] = [
		{
			id: "scraped",
			label: PLATFORM_TIER_LABELS.scraped,
			runsPerDay: plan.standardRunsPerDay,
			models: inTier("scraped"),
		},
		{ id: "api", label: PLATFORM_TIER_LABELS.api, runsPerDay: plan.standardRunsPerDay, models: inTier("api") },
	];

	const pickGroups = groups.filter((group) => group.models.length > 0);
	const pickable = pickGroups.flatMap((group) => group.models);
	// The whole premium tier, not narrowed to the pick menu: some models are
	// premium precisely because they are too dear to pick.
	const hasPremium = sellsPremium(plan);

	return {
		// A plan with a single option has nothing to choose, so it names it.
		pickHeading:
			plan.platformPicks === 1 && pickable.length === 1
				? `${getModelMeta(pickable[0].model).label} only`
				: `Choose any ${plan.platformPicks} platforms`,
		pickGroups,
		premium: hasPremium
			? {
					id: "premium",
					label: PLATFORM_TIER_LABELS.premium,
					runsPerDay: PREMIUM_RUNS_PER_DAY,
					models: PREMIUM_MODELS.map((model) => tierMember(model, "premium")),
					includedSlots: plan.premiumIncluded,
					addonAvailable: plan.premiumAddonAvailable,
					summary: premiumSummary(plan),
				}
			: null,
	};
}

/** The only place the plan grid quotes the add-on, so it carries the price. */
function premiumSummary(plan: PlanDefinition): string {
	// Only called for plans that sell the tier, so none included means add-on only.
	if (plan.premiumIncluded === 0) {
		return `Grounded and cited. Available as an add-on at $${PREMIUM_ADDON_MONTHLY_USD}/mo per pairing.`;
	}
	const included = `Grounded and cited. ${premiumPairings(plan.premiumIncluded)} included, each answered daily.`;
	return plan.premiumAddonAvailable ? `${included} $${PREMIUM_ADDON_MONTHLY_USD}/mo for each extra pairing.` : included;
}

export function premiumPairings(count: number): string {
	return `${count} prompt/model pairing${count === 1 ? "" : "s"}`;
}

export interface SubscriptionCostLine {
	label: string;
	amountUsd: number;
}

export interface SubscriptionCost {
	interval: BillingInterval;
	lines: SubscriptionCostLine[];
	totalUsd: number;
}

/** Annual is quoted annually, not divided by twelve, so it matches the charge the customer sees. */
export function summarizeSubscriptionCost(input: {
	plan: PlanKey;
	interval: BillingInterval;
	addonQuantity: number;
}): SubscriptionCost {
	const plan = PLANS[input.plan];
	const annual = input.interval === "annual";
	const quantity = Math.max(0, Math.floor(input.addonQuantity));

	const lines: SubscriptionCostLine[] = [
		{ label: `${plan.name} plan`, amountUsd: annual ? plan.annualPriceUsd : plan.monthlyPriceUsd },
	];
	if (quantity > 0) {
		const each = annual ? PREMIUM_ADDON_ANNUAL_USD : PREMIUM_ADDON_MONTHLY_USD;
		lines.push({
			label: `${quantity} extra premium pairing${quantity === 1 ? "" : "s"}`,
			amountUsd: quantity * each,
		});
	}

	return {
		interval: input.interval,
		lines,
		totalUsd: lines.reduce((sum, line) => sum + line.amountUsd, 0),
	};
}

export const CLOUD_SIGNUP_URL = `${CLOUD_APP_URL}/auth/register`;

export const CLOUD_ENTRY_PRICE_USD = Math.min(...PLAN_KEYS.map((key) => PLANS[key].monthlyPriceUsd));

/**
 * The plan singled out wherever the ladder is shown. Starter is the price the
 * site leads with, but it tracks one platform once a day; Basic is the first
 * plan that delivers what the homepage describes, so it is the one to point at.
 */
export const RECOMMENDED_PLAN: PlanKey = "basic";

/**
 * How long after first checkout a customer can ask for a full refund. Quoted
 * wherever a plan is sold, so it lives with the plans rather than in copy.
 */
export const MONEY_BACK_GUARANTEE_DAYS = 7;
