/**
 * The Elmo Cloud plan catalog.
 *
 * This file is the single source of truth for what each cloud plan includes.
 * Billing (Stripe products/prices), write-time enforcement, the worker's run
 * policy, and the pricing/billing UI all consume these definitions — change a
 * number here and every layer follows.
 *
 * Stripe prices are referenced by lookup key (stripePlanLookupKey /
 * PREMIUM_ADDON_LOOKUP_KEYS) rather than per-environment price-ID env vars;
 * packages/cloud/scripts/bootstrap-stripe.ts provisions any Stripe account (test or live)
 * with these exact keys.
 */

import { getModelMeta } from "./models";

export type PlanKey = "starter" | "basic" | "pro" | "business";

export type BillingInterval = "monthly" | "annual";

/** Whether Elmo Cloud reaches a platform by scraping its product or calling an API. */
export type ProviderAccessKind = "scraped" | "api";

export interface CloudPlatform {
	/**
	 * How a standard pick of this platform is served. Omitted when the platform
	 * is only sold grounded: Grok's own answers cost several times a scrape per
	 * run, so it earns its keep as a premium call and not as one of four picks
	 * sampled four times a day.
	 */
	access?: ProviderAccessKind;
	/**
	 * Also sold grounded: the model called directly with its own web search on,
	 * paid for out of the org's premium pool rather than the pick budget. A
	 * grounded call costs roughly ten times an ungrounded one, which is why it is
	 * metered per prompt instead of picked per brand.
	 */
	premium?: boolean;
}

/**
 * Everything Elmo Cloud sells, and how. An entry with `access` is pickable as a
 * standard platform, which decides its sampling rate and which tier the pricing
 * tables group it under; an entry with `premium` is sold grounded from the pool.
 * Most are both. A platform cannot be listed without being one or the other.
 *
 * A self-hosted operator can wire the same model differently — this describes
 * the cloud offering the plans are priced against, not what Elmo can track.
 *
 * A menu entry is only offerable when the operator's SCRAPE_TARGETS actually
 * configures a matching target; the UI and run policy intersect with the
 * instance's configured targets.
 *
 * Order matters: defaultPlatformPicks takes the plan's pick count off the front
 * of this list, so a brand created without an explicit choice tracks the first
 * entries. Append new platforms rather than inserting them, or existing
 * deployments change what a new brand starts out tracking.
 */
export const CLOUD_PLATFORMS: Record<string, CloudPlatform> = {
	chatgpt: { access: "scraped", premium: true },
	"google-ai-mode": { access: "scraped" },
	"google-ai-overview": { access: "scraped" },
	copilot: { access: "scraped" },
	perplexity: { access: "scraped" },
	gemini: { access: "scraped" },
	qwen: { access: "api" },
	deepseek: { access: "api" },
	grok: { premium: true },
	mistral: { access: "api" },
	claude: { access: "api", premium: true },
};

/** The platforms a plan's picks may come from — everything sold as a pick. */
export const STANDARD_PLATFORM_MENU: readonly string[] = Object.entries(CLOUD_PLATFORMS)
	.filter(([, platform]) => platform.access !== undefined)
	.map(([model]) => model);

/**
 * The models sellable as premium — grounded, cited answers from the model's own
 * web search. A prompt spends one pool slot per model it is tracked on, so an org
 * can spread its allowance across prompts or across models as it likes.
 *
 * Not a subset of the pick menu: a model whose answers are too dear to sample
 * four times a day can still be worth one grounded call, which is exactly what
 * the pool is for.
 */
export const PREMIUM_MODELS: readonly string[] = ["claude", "chatgpt", "grok"];

/**
 * What a premium model is called where it is sold, which is not what it is called
 * as a pick: the premium tier sells the grounded variant, and "ChatGPT" and
 * "GPT-5 Search" are different products to a customer comparing them.
 */
const PREMIUM_LABELS: Record<string, string> = {
	claude: "Claude Sonnet 5 (web)",
	chatgpt: "GPT-5 Search",
	grok: "Grok (web)",
};

/** What to call a premium model, wherever the grounded variant is shown. */
export function premiumModelLabel(model: string): string {
	return PREMIUM_LABELS[model] ?? getModelMeta(model).label;
}

/**
 * The premium models in a requested list, deduped and in catalog order. Anything
 * not sellable as premium is dropped rather than rejected: the list names paid
 * tracking, so an unknown entry should cost nothing, not fail a whole save.
 */
export function selectPremiumModels(requested: readonly string[] | undefined): string[] {
	if (!requested || requested.length === 0) return [];
	return PREMIUM_MODELS.filter((model) => requested.includes(model));
}

/**
 * Premium slots a set of prompts spends: one per model it is tracked on, and
 * none at all while it is disabled, since a disabled prompt runs nothing.
 *
 * The rule is here rather than at each call site because the write guard, the
 * prompts editor's live counter and the org-wide total all have to agree — and
 * a customer is charged on the difference.
 */
export function premiumSlotsUsed(prompts: readonly { enabled: boolean; premiumModels: readonly string[] }[]): number {
	return prompts.reduce((total, prompt) => total + (prompt.enabled ? prompt.premiumModels.length : 0), 0);
}

/** Grounded calls sample once a day on every plan: each one is metered. */
export const PREMIUM_RUNS_PER_DAY = 1;

/** Ceiling for custom-plan sampling overrides (research-grade). */
export const MAX_STANDARD_RUNS_PER_DAY = 7;

/** Dunning: how long past_due keeps tracking alive before it pauses. */
export const PAST_DUE_GRACE_DAYS = 7;

/** Extra premium prompt/model slots: $5 each per month, Pro and Business only. */
export const PREMIUM_ADDON_MONTHLY_USD = 5;

/** Annual = 10× monthly (two months free). */
export const PREMIUM_ADDON_ANNUAL_USD = PREMIUM_ADDON_MONTHLY_USD * 10;

export interface PlanDefinition {
	key: PlanKey;
	name: string;
	monthlyPriceUsd: number;
	/** Annual = 10× monthly (two months free). */
	annualPriceUsd: number;
	/** Brands per organization. Every limit below is org-wide, not per brand. */
	maxBrands: number;
	/** Organization-wide pool of enabled (tracked) prompts. */
	maxPrompts: number;
	/** Which standard platforms this plan may choose from. */
	platformMenu: readonly string[];
	/** How many platforms a brand may have enabled at once. */
	platformPicks: number;
	/** Sampling frequency for standard platforms. */
	standardRunsPerDay: number;
	/**
	 * Premium slots included: one slot tracks one prompt on one premium model
	 * (prompts.premium_models). Picking a premium model ungrounded costs nothing
	 * from this pool — it is only the grounded call that is metered.
	 */
	premiumIncluded: number;
	/** Whether more premium slots can be purchased. */
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

/** The most brands any self-serve plan sells, so a guard can tell a customer
 *  whether upgrading would help or whether they need a custom agreement. */
export const MAX_SELF_SERVE_BRANDS = Math.max(...Object.values(PLANS).map((plan) => plan.maxBrands));

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];

export function isPlanKey(value: string): value is PlanKey {
	return value in PLANS;
}

/**
 * Whether extra premium slots can be purchased for a resolved plan key. Custom
 * plans always may; no plan means nothing to attach the add-on to.
 */
export function isPremiumAddonAvailable(planKey: PlanKey | "custom" | null): boolean {
	if (planKey === "custom") return true;
	return planKey !== null && PLANS[planKey].premiumAddonAvailable;
}

/** Human-readable name for a resolved plan key. */
export function planDisplayName(planKey: PlanKey | "custom" | null): string {
	if (planKey === "custom") return "Custom";
	return planKey === null ? "None" : PLANS[planKey].name;
}

/**
 * Stripe price lookup key for a plan/interval. The @better-auth/stripe plugin
 * resolves these to price IDs at checkout time, so the same code works against
 * any Stripe account bootstrapped with packages/cloud/scripts/bootstrap-stripe.ts.
 */
export function stripePlanLookupKey(plan: PlanKey, interval: BillingInterval): string {
	return `elmo_cloud_${plan}_${interval}`;
}

export const PREMIUM_ADDON_LOOKUP_KEYS: Record<BillingInterval, string> = {
	monthly: "elmo_cloud_premium_extra_monthly",
	annual: "elmo_cloud_premium_extra_annual",
};

export type PlanPlatformGroupId = "scraped" | "api" | "premium";

/**
 * What each tier is called, wherever it is shown. One place, because the
 * pricing table, the paywall and the LLM settings page all name them and had
 * each kept their own copy.
 */
export const PLATFORM_TIER_LABELS: Record<PlanPlatformGroupId, string> = {
	scraped: "Scraped Engines",
	api: "LLM APIs",
	premium: "Premium LLM APIs",
};

export interface PlanPlatformMember {
	model: string;
	/** What to call it in this tier; the premium tier names the grounded variant. */
	label: string;
}

export interface PlanPlatformGroup {
	id: PlanPlatformGroupId;
	/** How this group is reached, for a pricing card's sub-heading. */
	label: string;
	/** The rate every platform in this group runs at. */
	runsPerDay: number;
	models: PlanPlatformMember[];
}

export interface PlanPlatformBreakdown {
	/**
	 * What the plan lets you choose, in one line. Derived here because both the
	 * paywall and the marketing table need it and had each written their own,
	 * which promptly diverged.
	 */
	pickHeading: string;
	/**
	 * Every group a plan's picks may come from. All of them spend the same
	 * `platformPicks` budget — including Claude, which is why a pricing table
	 * that lists it outside the budget reads as though it were extra.
	 */
	pickGroups: PlanPlatformGroup[];
	/**
	 * The premium tier: grounded, cited answers chosen per prompt, on top of
	 * whatever the brand picks. A prompt can be tracked on one premium model,
	 * several, or none, and each costs a slot — it neither replaces nor upgrades a
	 * pick, and the picks keep running on every prompt regardless.
	 *
	 * Shaped like a pick group so a table can render all three tiers the same way,
	 * but it spends the premium pool rather than the pick budget. Null when the
	 * plan sells none, so a table can omit it rather than advertising an absence.
	 */
	premium:
		| (PlanPlatformGroup & {
				/** Slots included, each one prompt tracked on one of these models. */
				includedSlots: number;
				addonAvailable: boolean;
				/** How the allowance is sold, in one line, for the same reason. */
				summary: string;
		  })
		| null;
}

/**
 * A plan's platforms split into the two tiers a customer picks between, plus the
 * premium tier that is metered rather than picked.
 *
 * The first two tiers are the brand's picks and run on every one of its prompts.
 * The premium tier is chosen per prompt instead, and adds to those picks rather
 * than standing in for them. Some models appear in both, which is not a
 * relationship between the two — a pick and a premium slot buy different answers
 * (what a model already believes, versus what it finds and cites), and either can
 * be bought without the other.
 *
 * Members carry their own rate because the priciest models sample less often than
 * the group, so the group's rate is a default rather than a promise.
 */
export function planPlatformBreakdown(plan: PlanDefinition): PlanPlatformBreakdown {
	const inTier = (access: ProviderAccessKind): PlanPlatformMember[] =>
		plan.platformMenu
			.filter((model) => CLOUD_PLATFORMS[model]?.access === access)
			.map((model) => ({ model, label: getModelMeta(model).label }));

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
	// A plan either sells the premium tier or it doesn't; when it does, the whole
	// tier comes with it. Narrowing it to the plan's pick menu would drop the
	// models that are premium precisely because they are too dear to pick.
	const hasPremium = plan.premiumIncluded > 0 || plan.premiumAddonAvailable;

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
					models: PREMIUM_MODELS.map((model) => ({ model, label: premiumModelLabel(model) })),
					includedSlots: plan.premiumIncluded,
					addonAvailable: plan.premiumAddonAvailable,
					summary: premiumSummary(plan),
				}
			: null,
	};
}

/**
 * What the premium allowance buys, in one sentence. It is spent on pairings of a
 * prompt with a model, so the count is neither prompts nor models — 20 buys one
 * prompt on twenty models, twenty prompts on one, or anything between. The price
 * of more is left to whatever sits alongside this, so the two don't say it twice.
 */
function premiumSummary(plan: PlanDefinition): string {
	if (plan.premiumIncluded === 0) return "Grounded and cited. Available as an add-on.";
	return `Grounded and cited. ${premiumPairings(plan.premiumIncluded)} included, each answered daily.`;
}

/** The premium allowance's unit, named the same way wherever it is counted. */
export function premiumPairings(count: number): string {
	return `${count} prompt/model pairing${count === 1 ? "" : "s"}`;
}

export interface SubscriptionCostLine {
	label: string;
	amountUsd: number;
}

export interface SubscriptionCost {
	interval: BillingInterval;
	/** What the total is made of, so a bill can be read rather than trusted. */
	lines: SubscriptionCostLine[];
	totalUsd: number;
}

/**
 * What an org is billed each period: the plan plus any add-on quantity, at the
 * interval it actually pays on. Annual is quoted annually rather than divided by
 * twelve — a customer on annual billing is charged the annual figure, and showing
 * a monthly equivalent invites them to look for a charge that never appears.
 */
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

export const CLOUD_SIGNUP_URL = "https://app.elmohq.com/auth/register";

/** Lowest self-serve monthly price among all plans. */
export const CLOUD_ENTRY_PRICE_USD = Math.min(...PLAN_KEYS.map((key) => PLANS[key].monthlyPriceUsd));
