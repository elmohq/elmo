import { CLOUD_CLAUDE_PROMPT_ADDON, CLOUD_PLAN_CATALOG, type SelfServeCloudPlanId } from "@workspace/config/plans";
import type { ResolvedCloudPlanEntitlements } from "@workspace/config/entitlements";
import { resolveOrganizationEntitlements } from "@workspace/lib/cloud/entitlements";
import { db } from "@workspace/lib/db/db";
import {
	brandTargetSelections,
	brands,
	organizationBillingSubscriptionItems,
	organizationBillingSubscriptions,
	prompts,
	promptTargetAssignments,
	trackingUsageBuckets,
} from "@workspace/lib/db/schema";
import { and, count, eq, gt, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { identifyCloudPrice, type BillingInterval } from "./billing-catalog";
import { CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY, CLOUD_STRIPE_PLAN_METADATA_KEY } from "./billing-events";
import { CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE } from "./billing";

type DbConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_SELF_SERVE_CLAUDE_ADDON_PROMPT_SLOTS = Math.max(
	...Object.values(CLOUD_PLAN_CATALOG).map((plan) =>
		plan.entitlements.kind === "catalog" && plan.entitlements.value.claudeTracking.enabled
			? plan.entitlements.value.claudeTracking.addon.maximumAdditionalPromptSlots
			: 0,
	),
);

export interface CloudBillingResourceUsage {
	enabledBrands: number;
	enabledPrompts: number;
	selectedTargetsByBrand: Array<{ brandId: string; targetKeys: string[] }>;
	claudePromptAssignments: number;
}

export interface CloudBillingSubscriptionState {
	stripeSubscriptionId: string;
	stripeCustomerId: string;
	status: string;
	planId: string | null;
	interval: string | null;
	currentPeriodStart: Date | null;
	currentPeriodEnd: Date | null;
	cancelAtPeriodEnd: boolean;
	cancelAt: Date | null;
	syncedAt: Date;
	claudeAddonPromptSlots: number;
}

export interface CloudBillingMutationState {
	subscription: CloudBillingSubscriptionState | null;
	usage: CloudBillingResourceUsage;
}

export interface CloudBillingControlStore {
	load(organizationId: string, now: Date): Promise<CloudBillingMutationState>;
	withOrganizationLock<T>(
		organizationId: string,
		operation: (state: CloudBillingMutationState) => Promise<T>,
	): Promise<T>;
}

export type CloudBillingViolationCode =
	| "brand-capacity"
	| "prompt-capacity"
	| "target-capacity"
	| "target-not-available"
	| "claude-capacity"
	| "claude-addon-not-available"
	| "claude-addon-capacity";

export interface CloudBillingViolation {
	code: CloudBillingViolationCode;
	message: string;
	brandId?: string;
}

export class CloudBillingControlError extends Error {
	constructor(
		public readonly code:
			| "subscription-required"
			| "subscription-not-active"
			| "custom-plan-read-only"
			| "invalid-subscription"
			| "configuration-over-capacity"
			| "invalid-addon-quantity",
		message: string,
		public readonly violations: CloudBillingViolation[] = [],
	) {
		super(message);
		this.name = "CloudBillingControlError";
	}
}

function getSelfServeEntitlements(planId: SelfServeCloudPlanId): ResolvedCloudPlanEntitlements {
	const source = CLOUD_PLAN_CATALOG[planId].entitlements;
	if (source.kind !== "catalog") throw new Error(`Self-serve plan ${planId} has no catalog entitlements`);
	return {
		...source.value,
		claudeTracking: source.value.claudeTracking.enabled
			? {
					...source.value.claudeTracking,
					purchasedAddonPromptSlots: 0,
					totalPromptSlots: source.value.claudeTracking.includedPromptSlots,
				}
			: {
					...source.value.claudeTracking,
					purchasedAddonPromptSlots: 0,
					totalPromptSlots: 0,
				},
	};
}

export function validateCloudBillingConfiguration(input: {
	planId: SelfServeCloudPlanId;
	claudeAddonPromptSlots: number;
	usage: CloudBillingResourceUsage;
}): CloudBillingViolation[] {
	const entitlements = getSelfServeEntitlements(input.planId);
	const violations: CloudBillingViolation[] = [];
	if (input.usage.enabledBrands > entitlements.brandSlots) {
		violations.push({
			code: "brand-capacity",
			message: `${input.usage.enabledBrands} enabled brands exceed the ${entitlements.brandSlots}-brand limit.`,
		});
	}
	if (input.usage.enabledPrompts > entitlements.promptSlots) {
		violations.push({
			code: "prompt-capacity",
			message: `${input.usage.enabledPrompts} enabled prompts exceed the ${entitlements.promptSlots}-prompt limit.`,
		});
	}

	const availableTargets = new Set(entitlements.trackingTargets.targets.map((target) => target.targetKey));
	for (const selection of input.usage.selectedTargetsByBrand) {
		if (selection.targetKeys.length > entitlements.trackingTargets.maximumSelected) {
			violations.push({
				code: "target-capacity",
				brandId: selection.brandId,
				message: `${selection.brandId} has ${selection.targetKeys.length} targets selected; this plan allows ${entitlements.trackingTargets.maximumSelected}.`,
			});
		}
		for (const targetKey of selection.targetKeys) {
			if (!availableTargets.has(targetKey)) {
				violations.push({
					code: "target-not-available",
					brandId: selection.brandId,
					message: `${targetKey} is not available for ${selection.brandId} on this plan.`,
				});
			}
		}
	}

	if (!entitlements.claudeTracking.enabled) {
		if (input.claudeAddonPromptSlots > 0) {
			violations.push({
				code: "claude-addon-not-available",
				message: "This plan does not support Claude prompt add-ons.",
			});
		}
		if (input.usage.claudePromptAssignments > 0) {
			violations.push({
				code: "claude-capacity",
				message: "Remove Claude prompt tracking before changing to this plan.",
			});
		}
		return violations;
	}

	if (input.claudeAddonPromptSlots > entitlements.claudeTracking.addon.maximumAdditionalPromptSlots) {
		violations.push({
			code: "claude-addon-capacity",
			message: `This plan allows at most ${entitlements.claudeTracking.addon.maximumAdditionalPromptSlots} add-on Claude prompts.`,
		});
	}
	const totalClaudeSlots = entitlements.claudeTracking.includedPromptSlots + input.claudeAddonPromptSlots;
	if (input.usage.claudePromptAssignments > totalClaudeSlots) {
		violations.push({
			code: "claude-capacity",
			message: `${input.usage.claudePromptAssignments} Claude prompts exceed the ${totalClaudeSlots} available slots.`,
		});
	}
	return violations;
}

async function loadCloudBillingMutationState(
	conn: DbConnection,
	organizationId: string,
	now: Date,
): Promise<CloudBillingMutationState> {
	const [subscription] = await conn
		.select({
			stripeSubscriptionId: organizationBillingSubscriptions.stripeSubscriptionId,
			stripeCustomerId: organizationBillingSubscriptions.stripeCustomerId,
			status: organizationBillingSubscriptions.status,
			planId: organizationBillingSubscriptions.basePlanKey,
			interval: organizationBillingSubscriptions.billingInterval,
			currentPeriodStart: organizationBillingSubscriptions.currentPeriodStart,
			currentPeriodEnd: organizationBillingSubscriptions.currentPeriodEnd,
			cancelAtPeriodEnd: organizationBillingSubscriptions.cancelAtPeriodEnd,
			cancelAt: organizationBillingSubscriptions.cancelAt,
			syncedAt: organizationBillingSubscriptions.syncedAt,
		})
		.from(organizationBillingSubscriptions)
		.where(eq(organizationBillingSubscriptions.organizationId, organizationId))
		.limit(1);
	const [addon] = await conn
		.select({ quantity: organizationBillingSubscriptionItems.quantity })
		.from(organizationBillingSubscriptionItems)
		.where(
			and(
				eq(organizationBillingSubscriptionItems.organizationId, organizationId),
				eq(organizationBillingSubscriptionItems.type, "premium_addon"),
				eq(organizationBillingSubscriptionItems.active, true),
			),
		)
		.limit(1);

	const [{ value: enabledBrands = 0 } = { value: 0 }] = await conn
		.select({ value: count() })
		.from(brands)
		.where(and(eq(brands.organizationId, organizationId), eq(brands.enabled, true)));
	const [{ value: enabledPrompts = 0 } = { value: 0 }] = await conn
		.select({ value: count() })
		.from(prompts)
		.innerJoin(brands, eq(prompts.brandId, brands.id))
		.where(and(eq(brands.organizationId, organizationId), eq(prompts.enabled, true)));
	const targetRows = await conn
		.select({ brandId: brandTargetSelections.brandId, targetKey: brandTargetSelections.targetKey })
		.from(brandTargetSelections)
		.innerJoin(brands, eq(brandTargetSelections.brandId, brands.id))
		.where(and(eq(brands.organizationId, organizationId), eq(brandTargetSelections.enabled, true)));
	const targets = new Map<string, string[]>();
	for (const row of targetRows) targets.set(row.brandId, [...(targets.get(row.brandId) ?? []), row.targetKey]);
	const [claudeAssignments] = await conn
		.select({ value: sql<number>`count(distinct ${promptTargetAssignments.promptId})`.mapWith(Number) })
		.from(promptTargetAssignments)
		.innerJoin(brands, eq(promptTargetAssignments.brandId, brands.id))
		.innerJoin(prompts, eq(promptTargetAssignments.promptId, prompts.id))
		.where(
			and(
				eq(brands.organizationId, organizationId),
				eq(promptTargetAssignments.source, "premium"),
				eq(promptTargetAssignments.enabled, true),
				eq(prompts.enabled, true),
			),
		);

	return {
		subscription: subscription ? { ...subscription, claudeAddonPromptSlots: addon?.quantity ?? 0 } : null,
		usage: {
			enabledBrands,
			enabledPrompts,
			selectedTargetsByBrand: [...targets].map(([brandId, targetKeys]) => ({ brandId, targetKeys })),
			claudePromptAssignments: claudeAssignments?.value ?? 0,
		},
	};
}

export function createDrizzleCloudBillingControlStore(database: typeof db = db): CloudBillingControlStore {
	return {
		load: (organizationId, now) => loadCloudBillingMutationState(database, organizationId, now),
		withOrganizationLock: (organizationId, operation) =>
			database.transaction(async (tx) => {
				// Share the projection writer's lock so a webhook cannot replace the
				// subscription snapshot between validation and the Stripe mutation.
				await tx.execute(
					sql`SELECT pg_advisory_xact_lock(hashtextextended(${`elmo-cloud-billing:${organizationId}`}, 0))`,
				);
				return operation(await loadCloudBillingMutationState(tx, organizationId, new Date()));
			}),
	};
}

function requireMutableSubscription(state: CloudBillingMutationState): CloudBillingSubscriptionState {
	const subscription = state.subscription;
	if (!subscription) {
		throw new CloudBillingControlError("subscription-required", "Start a subscription before changing billing.");
	}
	if (subscription.planId === "custom") {
		throw new CloudBillingControlError("custom-plan-read-only", "Custom plans are managed by Elmo support.");
	}
	if (subscription.status !== "active" && subscription.status !== "trialing") {
		throw new CloudBillingControlError("subscription-not-active", "Billing changes require an active subscription.");
	}
	return subscription;
}

async function requireExactPrice(
	stripeClient: Stripe,
	expectation: { lookupKey: string; interval: BillingInterval; currency: string; unitAmountCents: number },
): Promise<Stripe.Price> {
	const prices = await stripeClient.prices.list({ active: true, lookup_keys: [expectation.lookupKey], limit: 2 });
	if (prices.data.length !== 1) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			`Expected exactly one active Stripe price for ${expectation.lookupKey}.`,
		);
	}
	const price = prices.data[0]!;
	if (
		price.recurring?.interval !== expectation.interval ||
		price.recurring.interval_count !== 1 ||
		price.currency !== expectation.currency ||
		price.unit_amount !== expectation.unitAmountCents
	) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			`${expectation.lookupKey} does not match the compiled billing catalog.`,
		);
	}
	return price;
}

interface ParsedSubscriptionItems {
	base: Stripe.SubscriptionItem;
	basePlanId: SelfServeCloudPlanId;
	interval: BillingInterval;
	addon?: Stripe.SubscriptionItem;
	addonQuantity: number;
}

function parseSelfServeItems(subscription: Stripe.Subscription): ParsedSubscriptionItems {
	const bases: Array<{ item: Stripe.SubscriptionItem; planId: SelfServeCloudPlanId; interval: BillingInterval }> = [];
	const addons: Stripe.SubscriptionItem[] = [];
	for (const item of subscription.items.data) {
		const identity = identifyCloudPrice(item.price.lookup_key);
		if (!identity) {
			throw new CloudBillingControlError(
				"invalid-subscription",
				`Stripe subscription ${subscription.id} contains an unmanaged price.`,
			);
		}
		if (item.price.recurring?.interval !== identity.interval || item.price.recurring.interval_count !== 1) {
			throw new CloudBillingControlError(
				"invalid-subscription",
				`Stripe price ${item.price.id} does not match its catalog billing interval.`,
			);
		}
		if (identity.kind === "base_plan" && identity.planId) {
			if ((item.quantity ?? 1) !== 1) {
				throw new CloudBillingControlError("invalid-subscription", "A self-serve base plan must have quantity 1.");
			}
			bases.push({ item, planId: identity.planId, interval: identity.interval });
		} else if (identity.kind === "premium_addon") {
			addons.push(item);
		} else {
			throw new CloudBillingControlError("invalid-subscription", `Stripe price ${item.price.id} is not self-serve.`);
		}
	}
	if (bases.length !== 1 || addons.length > 1) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			`Stripe subscription ${subscription.id} must contain one base plan and at most one Claude add-on.`,
		);
	}
	const base = bases[0]!;
	const addon = addons[0];
	if (addon) {
		const identity = identifyCloudPrice(addon.price.lookup_key);
		if (identity?.kind !== "premium_addon" || identity.interval !== base.interval) {
			throw new CloudBillingControlError("invalid-subscription", "Base plan and Claude add-on intervals must match.");
		}
	}
	const addonQuantity = addon ? (addon.quantity ?? 1) : 0;
	if (!Number.isSafeInteger(addonQuantity) || (addonQuantity <= 0 && addon !== undefined)) {
		throw new CloudBillingControlError("invalid-subscription", "Stripe has an invalid Claude add-on quantity.");
	}
	return { base: base.item, basePlanId: base.planId, interval: base.interval, addon, addonQuantity };
}

async function retrieveSelfServeSubscription(
	stripeClient: Stripe,
	projected: CloudBillingSubscriptionState,
): Promise<{ subscription: Stripe.Subscription; items: ParsedSubscriptionItems }> {
	const subscription = await stripeClient.subscriptions.retrieve(projected.stripeSubscriptionId, {
		expand: ["items.data.price"],
	});
	if (typeof subscription.customer === "string" && subscription.customer !== projected.stripeCustomerId) {
		throw new CloudBillingControlError("invalid-subscription", "Stripe customer does not match this workspace.");
	}
	if (subscription.metadata[CLOUD_STRIPE_PLAN_METADATA_KEY] === "custom") {
		throw new CloudBillingControlError("custom-plan-read-only", "Custom plans are managed by Elmo support.");
	}
	return { subscription, items: parseSelfServeItems(subscription) };
}

function assertConfigurationAllowed(input: {
	planId: SelfServeCloudPlanId;
	claudeAddonPromptSlots: number;
	usage: CloudBillingResourceUsage;
}): void {
	const violations = validateCloudBillingConfiguration(input);
	if (violations.length > 0) {
		throw new CloudBillingControlError(
			"configuration-over-capacity",
			"The workspace configuration exceeds the requested billing configuration.",
			violations,
		);
	}
}

function selfServePriceExpectation(planId: SelfServeCloudPlanId, interval: BillingInterval) {
	const billing = CLOUD_PLAN_CATALOG[planId].billing;
	if (billing.kind !== "self-serve") throw new Error(`${planId} is not self-serve`);
	const price = interval === "month" ? billing.monthly : billing.annual;
	return { lookupKey: price.lookupKey, interval, currency: billing.currency, unitAmountCents: price.unitAmountCents };
}

function addonPriceExpectation(interval: BillingInterval) {
	const price = interval === "month" ? CLOUD_CLAUDE_PROMPT_ADDON.monthly : CLOUD_CLAUDE_PROMPT_ADDON.annual;
	return {
		lookupKey: price.lookupKey,
		interval,
		currency: CLOUD_CLAUDE_PROMPT_ADDON.currency,
		unitAmountCents: price.unitAmountCents,
	};
}

function stripeMutationKey(organizationId: string, kind: "plan" | "addon", mutationId: string): string {
	return `elmo:${organizationId}:${kind}:${mutationId}`;
}

export async function changeCloudSubscriptionPlan(input: {
	organizationId: string;
	planId: SelfServeCloudPlanId;
	interval: BillingInterval;
	mutationId: string;
	stripeClient: Stripe;
	store?: CloudBillingControlStore;
}): Promise<{ accepted: true; stripeSubscriptionId: string }> {
	const store = input.store ?? createDrizzleCloudBillingControlStore();
	return store.withOrganizationLock(input.organizationId, async (state) => {
		const projected = requireMutableSubscription(state);
		const { subscription, items } = await retrieveSelfServeSubscription(input.stripeClient, projected);
		assertConfigurationAllowed({
			planId: input.planId,
			claudeAddonPromptSlots: items.addonQuantity,
			usage: state.usage,
		});
		const basePrice = await requireExactPrice(
			input.stripeClient,
			selfServePriceExpectation(input.planId, input.interval),
		);
		const updates: Stripe.SubscriptionUpdateParams.Item[] = [{ id: items.base.id, price: basePrice.id, quantity: 1 }];
		if (items.addon) {
			const addonPrice = await requireExactPrice(input.stripeClient, addonPriceExpectation(input.interval));
			updates.push({ id: items.addon.id, price: addonPrice.id, quantity: items.addonQuantity });
		}
		await input.stripeClient.subscriptions.update(
			subscription.id,
			{
				items: updates,
				metadata: {
					[CLOUD_STRIPE_PLAN_METADATA_KEY]: input.planId,
					[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY]: CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
				},
				payment_behavior: "pending_if_incomplete",
				proration_behavior: "always_invoice",
			},
			{ idempotencyKey: stripeMutationKey(input.organizationId, "plan", input.mutationId) },
		);
		return { accepted: true, stripeSubscriptionId: subscription.id };
	});
}

export async function setCloudClaudeAddonPromptSlots(input: {
	organizationId: string;
	quantity: number;
	mutationId: string;
	stripeClient: Stripe;
	store?: CloudBillingControlStore;
}): Promise<{ accepted: true; stripeSubscriptionId: string }> {
	if (
		!Number.isSafeInteger(input.quantity) ||
		input.quantity < 0 ||
		input.quantity > MAX_SELF_SERVE_CLAUDE_ADDON_PROMPT_SLOTS
	) {
		throw new CloudBillingControlError(
			"invalid-addon-quantity",
			`Claude add-on quantity must be a whole number between 0 and ${MAX_SELF_SERVE_CLAUDE_ADDON_PROMPT_SLOTS}.`,
		);
	}
	const store = input.store ?? createDrizzleCloudBillingControlStore();
	return store.withOrganizationLock(input.organizationId, async (state) => {
		const projected = requireMutableSubscription(state);
		const { subscription, items } = await retrieveSelfServeSubscription(input.stripeClient, projected);
		assertConfigurationAllowed({
			planId: items.basePlanId,
			claudeAddonPromptSlots: input.quantity,
			usage: state.usage,
		});
		const updates: Stripe.SubscriptionUpdateParams.Item[] = [];
		if (items.addon && input.quantity === 0) updates.push({ id: items.addon.id, deleted: true });
		if (input.quantity > 0) {
			const price = await requireExactPrice(input.stripeClient, addonPriceExpectation(items.interval));
			updates.push(
				items.addon
					? { id: items.addon.id, price: price.id, quantity: input.quantity }
					: { price: price.id, quantity: input.quantity },
			);
		}
		await input.stripeClient.subscriptions.update(
			subscription.id,
			{
				items: updates,
				payment_behavior: "pending_if_incomplete",
				proration_behavior: "always_invoice",
			},
			{ idempotencyKey: stripeMutationKey(input.organizationId, "addon", input.mutationId) },
		);
		return { accepted: true, stripeSubscriptionId: subscription.id };
	});
}

export interface SerializedCloudBillingView {
	subscription:
		| null
		| (Omit<CloudBillingSubscriptionState, "currentPeriodStart" | "currentPeriodEnd" | "cancelAt" | "syncedAt"> & {
				currentPeriodStart: string | null;
				currentPeriodEnd: string | null;
				cancelAt: string | null;
				syncedAt: string;
		  });
	usage: CloudBillingResourceUsage;
	usageBuckets: Array<{
		usageClass: "standard" | "premium" | "custom";
		quotaKey: string;
		periodStart: string;
		periodEnd: string;
		limitUnits: number;
		usedUnits: number;
	}>;
	entitlements: Awaited<ReturnType<typeof resolveOrganizationEntitlements>>;
}

export async function getSerializedCloudBillingView(input: {
	organizationId: string;
	now?: Date;
	store?: CloudBillingControlStore;
}): Promise<SerializedCloudBillingView> {
	const now = input.now ?? new Date();
	const store = input.store ?? createDrizzleCloudBillingControlStore();
	const state = await store.load(input.organizationId, now);
	const usageBuckets = await db
		.select({
			usageClass: trackingUsageBuckets.usageClass,
			quotaKey: trackingUsageBuckets.quotaKey,
			periodStart: trackingUsageBuckets.periodStart,
			periodEnd: trackingUsageBuckets.periodEnd,
			limitUnits: trackingUsageBuckets.limitUnits,
			usedUnits: trackingUsageBuckets.usedUnits,
		})
		.from(trackingUsageBuckets)
		.where(and(eq(trackingUsageBuckets.organizationId, input.organizationId), gt(trackingUsageBuckets.periodEnd, now)));
	const entitlements = await resolveOrganizationEntitlements({
		mode: "cloud",
		organizationId: input.organizationId,
		now,
	});
	return {
		subscription: state.subscription
			? {
					...state.subscription,
					currentPeriodStart: state.subscription.currentPeriodStart?.toISOString() ?? null,
					currentPeriodEnd: state.subscription.currentPeriodEnd?.toISOString() ?? null,
					cancelAt: state.subscription.cancelAt?.toISOString() ?? null,
					syncedAt: state.subscription.syncedAt.toISOString(),
				}
			: null,
		usage: state.usage,
		usageBuckets: usageBuckets.map((bucket) => ({
			...bucket,
			periodStart: bucket.periodStart.toISOString(),
			periodEnd: bucket.periodEnd.toISOString(),
		})),
		entitlements,
	};
}
