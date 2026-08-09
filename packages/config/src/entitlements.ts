/**
 * Pure entitlement resolution: (deployment mode, subscription state, add-on
 * quantity, per-org overrides) → what the organization may do.
 *
 * No I/O here. The DB-aware wrapper lives in @workspace/lib
 * (src/entitlements/), which loads the subscription + organization_settings
 * rows and calls resolveEntitlements. Keeping this pure makes the whole plan
 * matrix unit-testable and keeps non-cloud modes provably unaffected: every
 * mode except cloud resolves to UNLIMITED_ENTITLEMENTS and nothing else is
 * ever consulted.
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
 * Where the org stands with billing, as consumed by enforcement and the
 * run policy:
 * - active: subscription in good standing (or a custom plan) — full service
 * - grace:  past_due within the dunning window — tracking continues
 * - paused: past_due beyond the grace window — tracking stops, data readable
 * - none:   no subscription (or canceled/expired) — paywall
 */
export type SubscriptionStanding = "active" | "grace" | "paused" | "none";

/**
 * Per-org overrides for custom plans, stored in
 * organization_settings.entitlement_overrides (jsonb) and applied on top of
 * the plan definition. Sparse: set only what differs. Provisioning a custom
 * plan is config-only — no code changes.
 */
export const entitlementOverridesSchema = z
	.object({
		/**
		 * Marks the org as a custom plan billed outside Stripe self-serve.
		 * Forces standing to "active" regardless of any subscription row, and
		 * bases unspecified limits on the Business plan.
		 */
		planOverride: z.literal("custom").optional(),
		maxBrands: z.number().int().min(0).optional(),
		maxPrompts: z.number().int().min(0).optional(),
		/** Extra allowed platforms beyond the standard menu. */
		extraPlatforms: z.array(z.string().min(1)).optional(),
		platformPicks: z.number().int().min(0).optional(),
		standardRunsPerDay: z.number().int().min(1).max(MAX_STANDARD_RUNS_PER_DAY).optional(),
		/** Replaces the plan's included premium slots (add-on quantity still adds
		 *  on top). */
		premiumPoolIncluded: z.number().int().min(0).optional(),
		/** Replaces the fixed once-daily cadence for grounded premium calls. */
		premiumRunsPerDay: z.number().int().min(1).max(MAX_STANDARD_RUNS_PER_DAY).optional(),
		/** Runs per firing for standard targets (cloud default 1). */
		replication: z.number().int().min(1).max(10).optional(),
	})
	.strict();

export type EntitlementOverrides = z.infer<typeof entitlementOverridesSchema>;

/**
 * Validate overrides read from the database. Returns null (treated as "no
 * overrides", i.e. plain plan limits) when the payload is malformed — failing
 * safe toward the paid plan, never toward unlimited.
 */
export function parseEntitlementOverrides(value: unknown): EntitlementOverrides | null {
	if (value == null) return null;
	const parsed = entitlementOverridesSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export interface Entitlements {
	/**
	 * True outside cloud mode. Guards and the run policy short-circuit on this
	 * before consulting anything else; all limit fields are null.
	 */
	unlimited: boolean;
	planKey: PlanKey | "custom" | null;
	standing: SubscriptionStanding;
	/** Whether prompt tracking runs at all (standing active or grace). */
	trackingActive: boolean;
	maxBrands: number | null;
	maxPrompts: number | null;
	/** Allowed platform model names (menu + custom extras). Null = any. */
	platformMenu: string[] | null;
	platformPicks: number | null;
	standardRunsPerDay: number | null;
	/** Runs per firing for standard targets. Null = the deployment default. */
	replication: number | null;
	/**
	 * Premium slots: plan included (or override) + purchased add-on. One slot
	 * tracks one prompt on one premium model, so the pool is spent across
	 * prompt/model pairs. Picking a premium model ungrounded costs nothing here.
	 */
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
	/** Stripe subscription status as stored by @better-auth/stripe (webhook-driven). */
	status: string;
	/** Plan name stored on the subscription row (plugin lowercases it). */
	plan: string;
	/** End of the current billing period, when known. */
	periodEnd: Date | null;
}

/**
 * Derive the billing standing from the stored subscription row. Stripe keeps
 * status "active" through cancel_at_period_end, so a scheduled cancellation
 * stays active until the period actually ends (then the webhook flips the
 * status). past_due ages out of grace PAST_DUE_GRACE_DAYS after the period
 * that failed to renew.
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

export function resolveEntitlements(input: ResolveEntitlementsInput): Entitlements {
	if (input.mode !== "cloud") return UNLIMITED_ENTITLEMENTS;

	const overrides = input.overrides ?? {};
	const isCustom = overrides.planOverride === "custom";

	const subscriptionStanding = deriveSubscriptionStanding(input.subscription, input.now);
	const subscribedPlan =
		input.subscription && subscriptionStanding !== "none" && isPlanKey(input.subscription.plan)
			? PLANS[input.subscription.plan]
			: null;
	// Fully-custom orgs (no live self-serve subscription) start from Business
	// and override from there; custom-on-top-of-a-plan keeps the purchased plan.
	const basePlan = subscribedPlan ?? (isCustom ? PLANS.business : null);
	if (!basePlan) return NO_PLAN_ENTITLEMENTS;

	const standing = isCustom ? "active" : subscriptionStanding;
	if (standing === "none") return NO_PLAN_ENTITLEMENTS;

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
