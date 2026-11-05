/**
 * Pure, so the plan matrix is unit-testable; @workspace/lib/entitlements loads
 * the rows. Every mode except cloud resolves to UNLIMITED_ENTITLEMENTS.
 */

import { z } from "zod";
import {
	isPlanKey,
	MAX_STANDARD_RUNS_PER_DAY,
	PAST_DUE_GRACE_DAYS,
	PLANS,
	type PlanKey,
	PREMIUM_RUNS_PER_DAY,
} from "./plans";
import type { DeploymentMode } from "./types";

/**
 * - grace:  past_due within the dunning window — tracking continues
 * - paused: past_due beyond it — tracking stops, data stays readable
 * - none:   no live subscription — paywall
 */
export type SubscriptionStanding = "active" | "grace" | "paused" | "none";

/** Sparse per-org overrides on top of the plan, so a custom plan is config-only. */
export const entitlementOverridesSchema = z
	.object({
		/** Billed outside Stripe: always "active", with unspecified limits taken from Business. */
		planOverride: z.literal("custom").optional(),
		maxBrands: z.number().int().min(0).optional(),
		maxPrompts: z.number().int().min(0).optional(),
		/** Extra allowed platforms beyond the standard menu. */
		extraPlatforms: z.array(z.string().min(1)).optional(),
		platformPicks: z.number().int().min(0).optional(),
		standardRunsPerDay: z.number().int().min(1).max(MAX_STANDARD_RUNS_PER_DAY).optional(),
		/** Add-on quantity still adds on top. */
		premiumPoolIncluded: z.number().int().min(0).optional(),
		/** Replaces the fixed once-daily cadence for grounded premium calls. */
		premiumRunsPerDay: z.number().int().min(1).max(MAX_STANDARD_RUNS_PER_DAY).optional(),
		/** Runs per firing for standard targets (cloud default 1). */
		replication: z.number().int().min(1).max(10).optional(),
	})
	.strict();

export type EntitlementOverrides = z.infer<typeof entitlementOverridesSchema>;

/** Malformed overrides read as none, failing toward the paid plan rather than unlimited. */
export function parseEntitlementOverrides(value: unknown): EntitlementOverrides | null {
	if (value == null) return null;
	const parsed = entitlementOverridesSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export interface Entitlements {
	/** True outside cloud; every limit field is then null. */
	unlimited: boolean;
	planKey: PlanKey | "custom" | null;
	standing: SubscriptionStanding;
	/** Standing active or grace. */
	trackingActive: boolean;
	maxBrands: number | null;
	maxPrompts: number | null;
	/** Allowed platform model names (menu + custom extras). Null = any. */
	platformMenu: string[] | null;
	platformPicks: number | null;
	standardRunsPerDay: number | null;
	/** Runs per firing for standard targets. Null = the deployment default. */
	replication: number | null;
	/** Included plus purchased add-on; one slot tracks one prompt on one premium model. */
	premiumPool: number;
	premiumRunsPerDay: number;
}

export const UNLIMITED_ENTITLEMENTS: Entitlements = {
	unlimited: true,
	planKey: null,
	standing: "active",
	trackingActive: true,
	maxBrands: null,
	maxPrompts: null,
	platformMenu: null,
	platformPicks: null,
	standardRunsPerDay: null,
	replication: null,
	premiumPool: 0,
	premiumRunsPerDay: PREMIUM_RUNS_PER_DAY,
};

/** An unsubscribed cloud org: nothing may be created, nothing runs. */
export const NO_PLAN_ENTITLEMENTS: Entitlements = {
	unlimited: false,
	planKey: null,
	standing: "none",
	trackingActive: false,
	maxBrands: 0,
	maxPrompts: 0,
	platformMenu: [],
	platformPicks: 0,
	standardRunsPerDay: 0,
	replication: 1,
	premiumPool: 0,
	premiumRunsPerDay: PREMIUM_RUNS_PER_DAY,
};

export interface SubscriptionSnapshot {
	/** As stored by @better-auth/stripe from webhooks. */
	status: string;
	/** Lowercased by the plugin. */
	plan: string;
	periodEnd: Date | null;
}

/**
 * A scheduled cancellation stays "active" until the period ends, as Stripe keeps
 * it. past_due leaves grace PAST_DUE_GRACE_DAYS after the period that failed to renew.
 */
export function deriveSubscriptionStanding(subscription: SubscriptionSnapshot | null, now: Date): SubscriptionStanding {
	if (!subscription) return "none";
	switch (subscription.status) {
		case "active":
		case "trialing":
			return "active";
		case "past_due": {
			if (!subscription.periodEnd) return "grace";
			const graceEndsMs = subscription.periodEnd.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
			return now.getTime() <= graceEndsMs ? "grace" : "paused";
		}
		default:
			// canceled, incomplete, incomplete_expired, unpaid, paused, …
			return "none";
	}
}

export interface ResolveEntitlementsInput {
	mode: DeploymentMode;
	subscription: SubscriptionSnapshot | null;
	premiumAddonQuantity: number;
	overrides: EntitlementOverrides | null;
	now: Date;
}

/**
 * Fully-custom orgs start from Business; custom on top of a purchased plan keeps
 * that plan. Null when nothing is owed to the org.
 */
function resolveBasePlan(
	subscription: SubscriptionSnapshot | null,
	isCustom: boolean,
	now: Date,
): { basePlan: (typeof PLANS)[PlanKey]; standing: SubscriptionStanding } | null {
	const subscriptionStanding = deriveSubscriptionStanding(subscription, now);
	const subscribedPlan =
		subscription && subscriptionStanding !== "none" && isPlanKey(subscription.plan) ? PLANS[subscription.plan] : null;

	const basePlan = subscribedPlan ?? (isCustom ? PLANS.business : null);
	if (!basePlan) return null;

	const standing = isCustom ? "active" : subscriptionStanding;
	return standing === "none" ? null : { basePlan, standing };
}

export function resolveEntitlements(input: ResolveEntitlementsInput): Entitlements {
	if (input.mode !== "cloud") return UNLIMITED_ENTITLEMENTS;

	const overrides = input.overrides ?? {};
	const isCustom = overrides.planOverride === "custom";
	const base = resolveBasePlan(input.subscription, isCustom, input.now);
	if (!base) return NO_PLAN_ENTITLEMENTS;
	const { basePlan, standing } = base;

	const premiumIncluded = overrides.premiumPoolIncluded ?? basePlan.premiumIncluded;
	const addonQuantity =
		basePlan.premiumAddonAvailable || isCustom ? Math.max(0, Math.floor(input.premiumAddonQuantity)) : 0;

	const menu = [...basePlan.platformMenu, ...(overrides.extraPlatforms ?? [])];

	return {
		unlimited: false,
		planKey: isCustom ? "custom" : basePlan.key,
		standing,
		trackingActive: standing === "active" || standing === "grace",
		maxBrands: overrides.maxBrands ?? basePlan.maxBrands,
		maxPrompts: overrides.maxPrompts ?? basePlan.maxPrompts,
		platformMenu: [...new Set(menu)],
		platformPicks: overrides.platformPicks ?? basePlan.platformPicks,
		standardRunsPerDay: Math.min(
			overrides.standardRunsPerDay ?? basePlan.standardRunsPerDay,
			MAX_STANDARD_RUNS_PER_DAY,
		),
		replication: overrides.replication ?? 1,
		premiumPool: premiumIncluded + addonQuantity,
		premiumRunsPerDay: Math.min(overrides.premiumRunsPerDay ?? PREMIUM_RUNS_PER_DAY, MAX_STANDARD_RUNS_PER_DAY),
	};
}
