import { canStartCloudSubscriptionCheckout } from "@workspace/config/billing-lifecycle";
import type { CloudEntitlementDenialReason, ResolvedCloudPlanEntitlements } from "@workspace/config/entitlements";
import {
	CLOUD_CLAUDE_PROMPT_ADDON,
	CLOUD_PLAN_CATALOG,
	SELF_SERVE_CLOUD_PLAN_IDS,
	type SelfServeCloudPlanId,
} from "@workspace/config/plans";
import { lockOrganizationCapacityAndBilling } from "@workspace/lib/cloud/advisory-locks";
import { reconcileOrganizationTrackingEntitlementsInTransaction } from "@workspace/lib/cloud/entitlement-reconciliation";
import {
	createOrganizationEntitlementSourceStore,
	type OrganizationEntitlementSourceResolution,
	resolveOrganizationEntitlementSource,
} from "@workspace/lib/cloud/entitlements";
import { db } from "@workspace/lib/db/db";
import {
	brands,
	brandTargetSelections,
	type OrganizationBillingMutation,
	organization,
	organizationBillingMutations,
	organizationBillingSubscriptionItems,
	organizationBillingSubscriptions,
	prompts,
	promptTargetAssignments,
	trackingUsageBuckets,
} from "@workspace/lib/db/schema";
import { and, asc, count, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { type BillingInterval, identifyCloudPrice } from "./billing-catalog";
import {
	buildCloudBillingSubscriptionProjection,
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
	CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
} from "./billing-events";
import {
	CLOUD_BILLING_MUTATION_METADATA_KEY,
	type CloudBillingSubscriptionProjection,
	createCloudBillingProjectionWriter,
} from "./billing-store";

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
	canceledAt: Date | null;
	endedAt: Date | null;
	delinquentSince: Date | null;
	syncedAt: Date;
	claudeAddonPromptSlots: number;
}

export interface CloudBillingMutationState {
	organization: { name: string; stripeCustomerId: string | null };
	subscription: CloudBillingSubscriptionState | null;
	usage: CloudBillingResourceUsage;
}

export type CloudBillingMutationKind = "checkout" | "plan" | "addon";
export type CloudBillingMutationStatus = "pending" | "applied" | "failed";

export interface CloudBillingMutationTarget {
	planId: SelfServeCloudPlanId;
	interval: BillingInterval;
	claudeAddonPromptSlots: number;
}

export interface PreparedCloudBillingMutation {
	stripeSubscriptionId: string | null;
	stripeCustomerId: string | null;
	target: CloudBillingMutationTarget;
	stripeUpdateParams: Record<string, unknown>;
}

export interface CloudBillingMutationRecord extends PreparedCloudBillingMutation {
	id: string;
	organizationId: string;
	mutationId: string;
	kind: CloudBillingMutationKind;
	status: CloudBillingMutationStatus;
	stripeIdempotencyKey: string;
	attemptCount: number;
	nextAttemptAt: Date;
	lastError: string | null;
	stripeCheckoutSessionId: string | null;
	stripeCheckoutSessionUrl: string | null;
	stripeCheckoutExpiresAt: Date | null;
}

export type BeginCloudBillingMutationResult =
	| { state: "pending" | "applied" | "failed"; mutation: CloudBillingMutationRecord }
	| { state: "other-pending"; mutation: CloudBillingMutationRecord };

export interface CloudBillingControlStore {
	load(organizationId: string, now: Date): Promise<CloudBillingMutationState>;
	beginMutation(
		organizationId: string,
		mutationId: string,
		kind: CloudBillingMutationKind,
		prepare: (state: CloudBillingMutationState) => Promise<PreparedCloudBillingMutation>,
	): Promise<BeginCloudBillingMutationResult>;
	projectMutation(mutation: CloudBillingMutationRecord, projection: CloudBillingSubscriptionProjection): Promise<void>;
	failMutation(mutation: CloudBillingMutationRecord, error: string, now: Date): Promise<void>;
	deferMutation(mutation: CloudBillingMutationRecord, error: string, retryAt: Date, now: Date): Promise<void>;
	listPendingMutations(now: Date, limit: number): Promise<CloudBillingMutationRecord[]>;
	recordCheckoutSession(
		mutation: CloudBillingMutationRecord,
		session: { id: string; url: string; expiresAt: Date; stripeCustomerId: string },
		now: Date,
		): Promise<CloudBillingMutationRecord>;
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
			| "invalid-addon-quantity"
			| "billing-change-in-progress"
			| "billing-change-failed",
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

export async function validateCloudInitialCheckout(input: {
	organizationId: string;
	planId: SelfServeCloudPlanId;
	store?: CloudBillingControlStore;
	now?: Date;
}): Promise<CloudBillingViolation[]> {
	const state = await (input.store ?? createDrizzleCloudBillingControlStore()).load(
		input.organizationId,
		input.now ?? new Date(),
	);
	return validateCloudBillingConfiguration({
		planId: input.planId,
		// Better Auth creates a fresh base-plan-only Checkout Session. Any add-on
		// is selected explicitly after the new subscription becomes authoritative.
		claudeAddonPromptSlots: 0,
		usage: state.usage,
	});
}

async function loadCloudBillingMutationState(
	conn: DbConnection,
	organizationId: string,
	now: Date,
): Promise<CloudBillingMutationState> {
	const [organizationRow] = await conn
		.select({ name: organization.name, stripeCustomerId: organization.stripeCustomerId })
		.from(organization)
		.where(eq(organization.id, organizationId))
		.limit(1);
	if (!organizationRow) throw new Error(`Organization ${organizationId} does not exist`);
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
			canceledAt: organizationBillingSubscriptions.canceledAt,
			endedAt: organizationBillingSubscriptions.endedAt,
			delinquentSince: organizationBillingSubscriptions.delinquentSince,
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
		organization: organizationRow,
		subscription: subscription ? { ...subscription, claudeAddonPromptSlots: addon?.quantity ?? 0 } : null,
		usage: {
			enabledBrands,
			enabledPrompts,
			selectedTargetsByBrand: [...targets].map(([brandId, targetKeys]) => ({ brandId, targetKeys })),
			claudePromptAssignments: claudeAssignments?.value ?? 0,
		},
	};
}

function parseStoredPlanId(value: string): SelfServeCloudPlanId {
	if (!SELF_SERVE_CLOUD_PLAN_IDS.includes(value as SelfServeCloudPlanId)) {
		throw new Error(`Billing mutation contains unsupported plan ${value}`);
	}
	return value as SelfServeCloudPlanId;
}

function parseStoredBillingInterval(value: string): BillingInterval {
	if (value !== "month" && value !== "year") throw new Error(`Billing mutation contains invalid interval ${value}`);
	return value;
}

function mapBillingMutation(row: OrganizationBillingMutation): CloudBillingMutationRecord {
	return {
		id: row.id,
		organizationId: row.organizationId,
		mutationId: row.mutationId,
		kind: row.kind,
		status: row.status,
		stripeSubscriptionId: row.stripeSubscriptionId,
		stripeCustomerId: row.stripeCustomerId,
		stripeIdempotencyKey: row.stripeIdempotencyKey,
		target: {
			planId: parseStoredPlanId(row.targetPlanKey),
			interval: parseStoredBillingInterval(row.targetBillingInterval),
			claudeAddonPromptSlots: row.targetClaudeAddonPromptSlots,
		},
		stripeUpdateParams: row.stripeUpdateParams,
		attemptCount: row.attemptCount,
		nextAttemptAt: row.nextAttemptAt,
		lastError: row.lastError,
		stripeCheckoutSessionId: row.stripeCheckoutSessionId,
		stripeCheckoutSessionUrl: row.stripeCheckoutSessionUrl,
		stripeCheckoutExpiresAt: row.stripeCheckoutExpiresAt,
	};
}

function errorText(error: string): string {
	return error.slice(0, 10_000);
}

export function createDrizzleCloudBillingControlStore(database: typeof db = db): CloudBillingControlStore {
	return {
		load: (organizationId, now) => loadCloudBillingMutationState(database, organizationId, now),

		beginMutation: (organizationId, mutationId, kind, prepare) =>
			database.transaction(async (tx) => {
				await lockOrganizationCapacityAndBilling(tx, organizationId);
				const [sameMutation] = await tx
					.select()
					.from(organizationBillingMutations)
					.where(
						and(
							eq(organizationBillingMutations.organizationId, organizationId),
							eq(organizationBillingMutations.mutationId, mutationId),
						),
					)
					.limit(1);
				if (sameMutation) return { state: sameMutation.status, mutation: mapBillingMutation(sameMutation) };

				const [otherPending] = await tx
					.select()
					.from(organizationBillingMutations)
					.where(
						and(
							eq(organizationBillingMutations.organizationId, organizationId),
							eq(organizationBillingMutations.status, "pending"),
						),
					)
					.limit(1);
				if (otherPending) return { state: "other-pending", mutation: mapBillingMutation(otherPending) };

				const prepared = await prepare(await loadCloudBillingMutationState(tx, organizationId, new Date()));
				const now = new Date();
				if (prepared.stripeCustomerId) {
					const [assignedCustomer] = await tx
						.update(organization)
						.set({ stripeCustomerId: prepared.stripeCustomerId })
						.where(
							and(
								eq(organization.id, organizationId),
								or(
									isNull(organization.stripeCustomerId),
									eq(organization.stripeCustomerId, prepared.stripeCustomerId),
								),
							),
						)
						.returning({ id: organization.id });
					if (!assignedCustomer) throw new Error(`Organization ${organizationId} changed Stripe customers`);
				}
				const [inserted] = await tx
					.insert(organizationBillingMutations)
					.values({
						organizationId,
						mutationId,
						kind,
						status: "pending",
						stripeSubscriptionId: prepared.stripeSubscriptionId,
						stripeCustomerId: prepared.stripeCustomerId,
						stripeIdempotencyKey: stripeMutationKey(organizationId, kind, mutationId),
						targetPlanKey: prepared.target.planId,
						targetBillingInterval: prepared.target.interval,
						targetClaudeAddonPromptSlots: prepared.target.claudeAddonPromptSlots,
						stripeUpdateParams: prepared.stripeUpdateParams,
						nextAttemptAt: now,
						createdAt: now,
						updatedAt: now,
					})
					.returning();
				if (!inserted) throw new Error("Billing mutation was not persisted");
				await reconcileOrganizationTrackingEntitlementsInTransaction({ tx, organizationId, now });
				return { state: "pending", mutation: mapBillingMutation(inserted) };
			}),

		projectMutation: (mutation, projection) =>
			database.transaction(async (tx) => {
				await lockOrganizationCapacityAndBilling(tx, mutation.organizationId);
				await createCloudBillingProjectionWriter(tx).replaceSubscription(projection);
				const [completed] = await tx
					.select({ status: organizationBillingMutations.status })
					.from(organizationBillingMutations)
					.where(eq(organizationBillingMutations.id, mutation.id))
					.limit(1);
				if (completed?.status !== "applied") {
					throw new Error(`Stripe projection did not satisfy billing mutation ${mutation.id}`);
				}
			}),

		failMutation: (mutation, error, now) =>
			database.transaction(async (tx) => {
				await lockOrganizationCapacityAndBilling(tx, mutation.organizationId);
				const [failed] = await tx
					.update(organizationBillingMutations)
					.set({
						status: "failed",
						attemptCount: sql`${organizationBillingMutations.attemptCount} + 1`,
						lastError: errorText(error),
						completedAt: now,
						updatedAt: now,
					})
					.where(
						and(
							eq(organizationBillingMutations.id, mutation.id),
							eq(organizationBillingMutations.status, "pending"),
						),
					)
					.returning({ id: organizationBillingMutations.id });
				if (failed) {
					await reconcileOrganizationTrackingEntitlementsInTransaction({
						tx,
						organizationId: mutation.organizationId,
						now,
					});
				}
			}),

		deferMutation: async (mutation, error, retryAt, now) => {
			await database
				.update(organizationBillingMutations)
				.set({
					attemptCount: sql`${organizationBillingMutations.attemptCount} + 1`,
					nextAttemptAt: retryAt,
					lastError: errorText(error),
					updatedAt: now,
				})
				.where(
					and(
						eq(organizationBillingMutations.id, mutation.id),
						eq(organizationBillingMutations.status, "pending"),
					),
				);
		},

		listPendingMutations: async (now, limit) => {
			const rows = await database
				.select()
				.from(organizationBillingMutations)
				.where(
					and(
						eq(organizationBillingMutations.status, "pending"),
						lte(organizationBillingMutations.nextAttemptAt, now),
					),
				)
				.orderBy(asc(organizationBillingMutations.nextAttemptAt), asc(organizationBillingMutations.createdAt))
				.limit(limit);
			return rows.map(mapBillingMutation);
		},

		recordCheckoutSession: (mutation, session, now) =>
			database.transaction(async (tx) => {
				await lockOrganizationCapacityAndBilling(tx, mutation.organizationId);
				const [updated] = await tx
					.update(organizationBillingMutations)
					.set({
						stripeCustomerId: session.stripeCustomerId,
						stripeCheckoutSessionId: session.id,
						stripeCheckoutSessionUrl: session.url,
						stripeCheckoutExpiresAt: session.expiresAt,
						nextAttemptAt: new Date(Math.min(session.expiresAt.getTime(), now.getTime() + 60_000)),
						lastError: null,
						updatedAt: now,
					})
					.where(
						and(
							eq(organizationBillingMutations.id, mutation.id),
							inArray(organizationBillingMutations.status, ["pending", "applied"]),
						),
					)
					.returning();
				if (updated) return mapBillingMutation(updated);
				const [current] = await tx
					.select()
					.from(organizationBillingMutations)
					.where(eq(organizationBillingMutations.id, mutation.id))
					.limit(1);
				if (!current) throw new Error(`Checkout mutation ${mutation.id} no longer exists`);
				return mapBillingMutation(current);
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
	if (subscription.status !== "active") {
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
		const expectation =
			identity.kind === "base_plan" && identity.planId
				? selfServePriceExpectation(identity.planId, identity.interval)
				: identity.kind === "premium_addon"
					? addonPriceExpectation(identity.interval)
					: null;
		if (
			!expectation ||
			item.price.currency !== expectation.currency ||
			item.price.unit_amount !== expectation.unitAmountCents ||
			item.price.active === false
		) {
			throw new CloudBillingControlError(
				"invalid-subscription",
				`Stripe price ${item.price.id} does not match the compiled billing catalog.`,
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
	const stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
	if (stripeCustomerId !== projected.stripeCustomerId) {
		throw new CloudBillingControlError("invalid-subscription", "Stripe customer does not match this workspace.");
	}
	if (subscription.metadata[CLOUD_STRIPE_PLAN_METADATA_KEY] === "custom") {
		throw new CloudBillingControlError("custom-plan-read-only", "Custom plans are managed by Elmo support.");
	}
	const items = parseSelfServeItems(subscription);
	if (
		subscription.metadata[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY] !== CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE ||
		subscription.metadata[CLOUD_STRIPE_PLAN_METADATA_KEY] !== items.basePlanId
	) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			"Stripe subscription metadata does not match its self-serve line items.",
		);
	}
	if (subscription.pending_update) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			"Resolve the existing Stripe pending update before changing billing.",
		);
	}
	return { subscription, items };
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

function stripeMutationKey(organizationId: string, kind: string, mutationId: string): string {
	return `elmo:${organizationId}:${kind}:${mutationId}`;
}

function asJsonObject(value: unknown): Record<string, unknown> {
	return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function storedSubscriptionUpdateParams(mutation: CloudBillingMutationRecord): Stripe.SubscriptionUpdateParams {
	const params = mutation.stripeUpdateParams;
	if (
		params.payment_behavior !== "error_if_incomplete" ||
		params.proration_behavior !== "always_invoice" ||
		!Array.isArray(params.items) ||
		!Array.isArray(params.expand) ||
		params.expand.length !== 1 ||
		params.expand[0] !== "items.data.price"
	) {
		throw new CloudBillingControlError("invalid-subscription", "Stored Stripe billing command is invalid.");
	}
	for (const item of params.items) {
		if (!item || typeof item !== "object") {
			throw new CloudBillingControlError("invalid-subscription", "Stored Stripe line item command is invalid.");
		}
		const candidate = item as Record<string, unknown>;
		if (
			(candidate.id !== undefined && typeof candidate.id !== "string") ||
			(candidate.price !== undefined && typeof candidate.price !== "string") ||
			(candidate.quantity !== undefined &&
				(!Number.isSafeInteger(candidate.quantity) || (candidate.quantity as number) <= 0)) ||
			(candidate.deleted !== undefined && candidate.deleted !== true)
		) {
			throw new CloudBillingControlError("invalid-subscription", "Stored Stripe line item command is invalid.");
		}
	}
	return params as unknown as Stripe.SubscriptionUpdateParams;
}

function inspectMutationSubscription(
	subscription: Stripe.Subscription,
	mutation: CloudBillingMutationRecord,
): ParsedSubscriptionItems {
	const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
	if (!mutation.stripeCustomerId || customerId !== mutation.stripeCustomerId) {
		throw new CloudBillingControlError("invalid-subscription", "Stripe customer does not match this billing command.");
	}
	if (subscription.pending_update) {
		throw new CloudBillingControlError("invalid-subscription", "Stripe returned an unresolved pending update.");
	}
	const items = parseSelfServeItems(subscription);
	if (
		subscription.metadata[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY] !== CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE ||
		subscription.metadata[CLOUD_STRIPE_PLAN_METADATA_KEY] !== items.basePlanId
	) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			"Stripe subscription metadata does not match its self-serve line items.",
		);
	}
	return items;
}

function subscriptionMatchesTarget(subscription: Stripe.Subscription, mutation: CloudBillingMutationRecord): boolean {
	const items = inspectMutationSubscription(subscription, mutation);
	return (
		items.basePlanId === mutation.target.planId &&
		items.interval === mutation.target.interval &&
		items.addonQuantity === mutation.target.claudeAddonPromptSlots
	);
}

function mutationFailureMessage(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 10_000);
}

function isDefinitiveStripeRejection(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const statusCode = (error as { statusCode?: unknown }).statusCode;
	return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500 && statusCode !== 409 && statusCode !== 429;
}

function nextMutationRetryAt(mutation: CloudBillingMutationRecord, now: Date): Date {
	const delayMilliseconds = Math.min(15 * 60_000, 15_000 * 2 ** Math.min(mutation.attemptCount, 6));
	return new Date(now.getTime() + delayMilliseconds);
}

function assertRequestedMutation(
	mutation: CloudBillingMutationRecord,
	kind: CloudBillingMutationKind,
	requested: Partial<CloudBillingMutationTarget>,
): void {
	if (
		mutation.kind !== kind ||
		(requested.planId !== undefined && mutation.target.planId !== requested.planId) ||
		(requested.interval !== undefined && mutation.target.interval !== requested.interval) ||
		(requested.claudeAddonPromptSlots !== undefined &&
			mutation.target.claudeAddonPromptSlots !== requested.claudeAddonPromptSlots)
	) {
		throw new CloudBillingControlError(
			"billing-change-failed",
			"This idempotency key was already used for a different billing command.",
		);
	}
}

function requirePendingMutation(result: BeginCloudBillingMutationResult): CloudBillingMutationRecord {
	if (result.state === "other-pending") {
		throw new CloudBillingControlError(
			"billing-change-in-progress",
			"Another billing change is still being reconciled. Try again shortly.",
		);
	}
	if (result.state === "failed") {
		throw new CloudBillingControlError(
			"billing-change-failed",
			result.mutation.lastError ?? "This billing change was rejected by Stripe.",
		);
	}
	return result.mutation;
}

async function projectAuthoritativeSubscription(input: {
	mutation: CloudBillingMutationRecord;
	subscription: Stripe.Subscription;
	store: CloudBillingControlStore;
	now: Date;
}): Promise<void> {
	if (!subscriptionMatchesTarget(input.subscription, input.mutation)) {
		throw new CloudBillingControlError("invalid-subscription", "Stripe did not apply the requested billing command.");
	}
	const projection = buildCloudBillingSubscriptionProjection(input.subscription, {
		organizationId: input.mutation.organizationId,
		eventId: null,
		eventCreatedAt: input.now,
		deleted: false,
		syncedAt: input.now,
	});
	await input.store.projectMutation(input.mutation, projection);
}

async function executeSubscriptionBillingMutation(input: {
	mutation: CloudBillingMutationRecord;
	stripeClient: Stripe;
	store: CloudBillingControlStore;
	now?: Date;
}): Promise<{ accepted: true; stripeSubscriptionId: string }> {
	const now = input.now ?? new Date();
	const subscriptionId = input.mutation.stripeSubscriptionId;
	if (!subscriptionId) throw new Error(`Billing mutation ${input.mutation.id} has no Stripe subscription`);

	try {
		let authoritative = await input.stripeClient.subscriptions.retrieve(subscriptionId, {
			expand: ["items.data.price"],
		});
		if (!subscriptionMatchesTarget(authoritative, input.mutation)) {
			authoritative = await input.stripeClient.subscriptions.update(
				subscriptionId,
				storedSubscriptionUpdateParams(input.mutation),
				{ idempotencyKey: input.mutation.stripeIdempotencyKey },
			);
		}
		await projectAuthoritativeSubscription({ mutation: input.mutation, subscription: authoritative, store: input.store, now });
		return { accepted: true, stripeSubscriptionId: subscriptionId };
	} catch (error) {
		const message = mutationFailureMessage(error);
		if (isDefinitiveStripeRejection(error)) {
			await input.store.failMutation(input.mutation, message, now);
			throw new CloudBillingControlError("billing-change-failed", `Stripe rejected this billing change: ${message}`);
		}
		await input.store.deferMutation(input.mutation, message, nextMutationRetryAt(input.mutation, now), now);
		throw error;
	}
}

const CHECKOUT_COMMAND_VERSION = 1;
const CHECKOUT_SESSION_LIFETIME_MILLISECONDS = 60 * 60_000;
const CUSTOMER_ORGANIZATION_METADATA_KEY = "organizationId";
const CUSTOMER_TYPE_METADATA_KEY = "customerType";

interface StoredCheckoutCommand {
	version: typeof CHECKOUT_COMMAND_VERSION;
	priceId: string;
	customerId: string;
	successUrl: string;
	cancelUrl: string;
	expiresAtEpochSeconds: number;
}

function storedCheckoutCommand(mutation: CloudBillingMutationRecord): StoredCheckoutCommand {
	const command = mutation.stripeUpdateParams;
	if (
		command.version !== CHECKOUT_COMMAND_VERSION ||
		typeof command.priceId !== "string" ||
		typeof command.customerId !== "string" ||
		typeof command.successUrl !== "string" ||
		typeof command.cancelUrl !== "string" ||
		!Number.isSafeInteger(command.expiresAtEpochSeconds)
	) {
		throw new CloudBillingControlError("invalid-subscription", "Stored Stripe Checkout command is invalid.");
	}
	let successUrl: URL;
	let cancelUrl: URL;
	try {
		successUrl = new URL(command.successUrl);
		cancelUrl = new URL(command.cancelUrl);
	} catch {
		throw new CloudBillingControlError("invalid-subscription", "Stored Stripe Checkout URL is invalid.");
	}
	for (const url of [successUrl, cancelUrl]) {
		if (
			(url.protocol !== "https:" && url.protocol !== "http:") ||
			url.username.length > 0 ||
			url.password.length > 0
		) {
			throw new CloudBillingControlError("invalid-subscription", "Stored Stripe Checkout URL is invalid.");
		}
	}
	if (successUrl.origin !== cancelUrl.origin) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			"Stored Stripe Checkout URLs must use the same application origin.",
		);
	}
	return command as unknown as StoredCheckoutCommand;
}

function stripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
	if (!customer) return null;
	return typeof customer === "string" ? customer : customer.id;
}

function assertOrganizationCustomer(customer: Stripe.Customer | Stripe.DeletedCustomer, organizationId: string): void {
	if (customer.deleted) {
		throw new CloudBillingControlError("invalid-subscription", "The workspace Stripe customer was deleted.");
	}
	if (
		customer.metadata[CUSTOMER_ORGANIZATION_METADATA_KEY] !== organizationId ||
		customer.metadata[CUSTOMER_TYPE_METADATA_KEY] !== "organization"
	) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			"The Stripe customer does not belong to this workspace.",
		);
	}
}

function escapeStripeSearchValue(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function ensureOrganizationStripeCustomer(input: {
	stripeClient: Stripe;
	organizationId: string;
	organizationName: string;
	customerEmail: string;
	existingCustomerId: string | null;
}): Promise<Stripe.Customer> {
	const ensureEmail = async (customer: Stripe.Customer): Promise<Stripe.Customer> => {
		if (customer.email?.trim()) return customer;
		const updated = await input.stripeClient.customers.update(customer.id, { email: input.customerEmail });
		assertOrganizationCustomer(updated, input.organizationId);
		return updated;
	};
	if (input.existingCustomerId) {
		const existing = await input.stripeClient.customers.retrieve(input.existingCustomerId);
		assertOrganizationCustomer(existing, input.organizationId);
		return ensureEmail(existing as Stripe.Customer);
	}

	const query = `metadata["${CUSTOMER_ORGANIZATION_METADATA_KEY}"]:"${escapeStripeSearchValue(input.organizationId)}" AND metadata["${CUSTOMER_TYPE_METADATA_KEY}"]:"organization"`;
	let matchedCustomers: Stripe.Customer[] = [];
	try {
		matchedCustomers = (await input.stripeClient.customers.search({ query, limit: 2 })).data;
	} catch {
		for await (const customer of input.stripeClient.customers.list({ limit: 100 })) {
			if (
				customer.metadata[CUSTOMER_ORGANIZATION_METADATA_KEY] === input.organizationId &&
				customer.metadata[CUSTOMER_TYPE_METADATA_KEY] === "organization"
			) {
				matchedCustomers.push(customer);
				if (matchedCustomers.length > 1) break;
			}
		}
	}
	if (matchedCustomers.length > 1) {
		throw new CloudBillingControlError(
			"invalid-subscription",
			"Multiple Stripe customers claim this workspace; billing is locked for review.",
		);
	}
	const matched = matchedCustomers[0];
	if (matched) {
		assertOrganizationCustomer(matched, input.organizationId);
		return ensureEmail(matched);
	}
	const created = await input.stripeClient.customers.create(
		{
			name: input.organizationName,
			email: input.customerEmail,
			metadata: {
				[CUSTOMER_ORGANIZATION_METADATA_KEY]: input.organizationId,
				[CUSTOMER_TYPE_METADATA_KEY]: "organization",
			},
		},
		{ idempotencyKey: `elmo:${input.organizationId}:customer:v1` },
	);
	assertOrganizationCustomer(created, input.organizationId);
	return created;
}

function checkoutSubscriptionId(session: Stripe.Checkout.Session): string | null {
	if (!session.subscription) return null;
	return typeof session.subscription === "string" ? session.subscription : session.subscription.id;
}

function assertCheckoutSession(input: {
	session: Stripe.Checkout.Session;
	mutation: CloudBillingMutationRecord;
	command: StoredCheckoutCommand;
}): void {
	const customerId = stripeCustomerId(input.session.customer);
	if (
		input.session.mode !== "subscription" ||
		input.session.client_reference_id !== input.mutation.organizationId ||
		customerId !== input.command.customerId ||
		input.session.metadata?.[CLOUD_BILLING_MUTATION_METADATA_KEY] !== input.mutation.id ||
		input.session.metadata?.[CLOUD_STRIPE_PLAN_METADATA_KEY] !== input.mutation.target.planId ||
		input.session.metadata?.[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY] !== CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE
	) {
		throw new CloudBillingControlError("invalid-subscription", "Stripe Checkout session does not match this command.");
	}
}

async function projectCheckoutSubscription(input: {
	mutation: CloudBillingMutationRecord;
	session: Stripe.Checkout.Session;
	stripeClient: Stripe;
	store: CloudBillingControlStore;
	now: Date;
}): Promise<void> {
	const subscriptionId = checkoutSubscriptionId(input.session);
	if (!subscriptionId) {
		throw new CloudBillingControlError("invalid-subscription", "Completed Checkout has no Stripe subscription.");
	}
	const subscription = await input.stripeClient.subscriptions.retrieve(subscriptionId, {
		expand: ["items.data.price"],
	});
	const projectedMutation = { ...input.mutation, stripeSubscriptionId: subscriptionId };
	await projectAuthoritativeSubscription({
		mutation: projectedMutation,
		subscription,
		store: input.store,
		now: input.now,
	});
}

async function executeCheckoutMutation(input: {
	mutation: CloudBillingMutationRecord;
	stripeClient: Stripe;
	store: CloudBillingControlStore;
	now?: Date;
}): Promise<{ accepted: true; url: string; terminal: boolean }> {
	const now = input.now ?? new Date();
	const command = storedCheckoutCommand(input.mutation);
	try {
		let session: Stripe.Checkout.Session;
		if (input.mutation.stripeCheckoutSessionId) {
			session = await input.stripeClient.checkout.sessions.retrieve(input.mutation.stripeCheckoutSessionId, {
				expand: ["subscription"],
			});
		} else {
				session = await input.stripeClient.checkout.sessions.create(
					{
						mode: "subscription",
						automatic_tax: { enabled: true },
						customer: command.customerId,
					client_reference_id: input.mutation.organizationId,
					success_url: command.successUrl,
					cancel_url: command.cancelUrl,
					expires_at: command.expiresAtEpochSeconds,
					line_items: [{ price: command.priceId, quantity: 1 }],
					metadata: {
						[CLOUD_BILLING_MUTATION_METADATA_KEY]: input.mutation.id,
						[CLOUD_STRIPE_PLAN_METADATA_KEY]: input.mutation.target.planId,
						[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY]: CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
						referenceId: input.mutation.organizationId,
					},
					subscription_data: {
						metadata: {
							[CLOUD_BILLING_MUTATION_METADATA_KEY]: input.mutation.id,
							[CLOUD_STRIPE_PLAN_METADATA_KEY]: input.mutation.target.planId,
							[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY]: CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
							referenceId: input.mutation.organizationId,
						},
					},
				},
				{ idempotencyKey: input.mutation.stripeIdempotencyKey },
			);
		}

		assertCheckoutSession({ session, mutation: input.mutation, command });
		if (session.status === "open" && session.expires_at * 1000 <= now.getTime()) {
			session = await input.stripeClient.checkout.sessions.expire(session.id);
			assertCheckoutSession({ session, mutation: input.mutation, command });
		}
		if (session.status === "complete") {
			await projectCheckoutSubscription({ ...input, session, now });
			if (!session.url && !input.mutation.stripeCheckoutSessionUrl) {
				throw new Error(`Completed Checkout session ${session.id} has no URL`);
			}
			return { accepted: true, url: session.url ?? input.mutation.stripeCheckoutSessionUrl!, terminal: true };
		}
		if (session.status === "expired") {
			await input.store.failMutation(input.mutation, "Stripe Checkout session expired.", now);
			throw new CloudBillingControlError("billing-change-failed", "The checkout session expired. Start a new checkout.");
		}
		if (session.status !== "open" || !session.url) {
			throw new CloudBillingControlError("invalid-subscription", "Stripe Checkout did not return an open hosted session.");
		}
		const recorded = await input.store.recordCheckoutSession(
			input.mutation,
			{
				id: session.id,
				url: session.url,
				expiresAt: new Date(session.expires_at * 1000),
				stripeCustomerId: command.customerId,
			},
			now,
		);
		if (recorded.status === "applied") {
			return { accepted: true, url: session.url, terminal: true };
		}
		if (recorded.status === "failed") {
			throw new CloudBillingControlError(
				"billing-change-failed",
				recorded.lastError ?? "The checkout command completed unsuccessfully.",
			);
		}
		return { accepted: true, url: session.url, terminal: false };
	} catch (error) {
		if (error instanceof CloudBillingControlError && error.code === "billing-change-failed") throw error;
		const message = mutationFailureMessage(error);
		if (isDefinitiveStripeRejection(error)) {
			await input.store.failMutation(input.mutation, message, now);
			throw new CloudBillingControlError("billing-change-failed", `Stripe rejected this checkout: ${message}`);
		}
		await input.store.deferMutation(input.mutation, message, nextMutationRetryAt(input.mutation, now), now);
		throw error;
	}
}

export async function startCloudInitialCheckout(input: {
	organizationId: string;
	planId: SelfServeCloudPlanId;
	interval: BillingInterval;
	mutationId: string;
	customerEmail: string;
	successUrl: string;
	cancelUrl: string;
	stripeClient: Stripe;
	store?: CloudBillingControlStore;
	now?: Date;
}): Promise<{ accepted: true; url: string }> {
	const store = input.store ?? createDrizzleCloudBillingControlStore();
	const now = input.now ?? new Date();
	const customerEmail = input.customerEmail.trim();
	if (!customerEmail) {
		throw new CloudBillingControlError("invalid-subscription", "A verified billing email is required for Checkout.");
	}
	const result = await store.beginMutation(input.organizationId, input.mutationId, "checkout", async (state) => {
		if (state.subscription?.planId === "custom") {
			throw new CloudBillingControlError("custom-plan-read-only", "Custom plans are managed by Elmo support.");
		}
		if (!canStartCloudSubscriptionCheckout(state.subscription?.status)) {
			throw new CloudBillingControlError(
				"invalid-subscription",
				"Resolve the existing Stripe subscription before starting another Checkout.",
			);
		}
		assertConfigurationAllowed({ planId: input.planId, claudeAddonPromptSlots: 0, usage: state.usage });
		const [customer, price] = await Promise.all([
			ensureOrganizationStripeCustomer({
				stripeClient: input.stripeClient,
				organizationId: input.organizationId,
				organizationName: state.organization.name,
				customerEmail,
				existingCustomerId: state.organization.stripeCustomerId,
			}),
			requireExactPrice(input.stripeClient, selfServePriceExpectation(input.planId, input.interval)),
		]);
		const expiresAt = new Date(now.getTime() + CHECKOUT_SESSION_LIFETIME_MILLISECONDS);
		return {
			stripeSubscriptionId: null,
			stripeCustomerId: customer.id,
			target: { planId: input.planId, interval: input.interval, claudeAddonPromptSlots: 0 },
			stripeUpdateParams: {
				version: CHECKOUT_COMMAND_VERSION,
				priceId: price.id,
				customerId: customer.id,
				successUrl: input.successUrl,
				cancelUrl: input.cancelUrl,
				expiresAtEpochSeconds: Math.floor(expiresAt.getTime() / 1000),
			},
		};
	});

	const matchingPendingCheckout =
		result.state === "other-pending" &&
		result.mutation.kind === "checkout" &&
		result.mutation.target.planId === input.planId &&
		result.mutation.target.interval === input.interval &&
		result.mutation.target.claudeAddonPromptSlots === 0;
	const mutation = matchingPendingCheckout ? result.mutation : requirePendingMutation(result);
	assertRequestedMutation(mutation, "checkout", { planId: input.planId, interval: input.interval });
	if (result.state === "applied") {
		if (mutation.stripeCheckoutSessionUrl) return { accepted: true, url: mutation.stripeCheckoutSessionUrl };
		throw new CloudBillingControlError("invalid-subscription", "This checkout has already completed.");
	}
	const checkout = await executeCheckoutMutation({ mutation, stripeClient: input.stripeClient, store, now });
	return { accepted: true, url: checkout.url };
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
	const result = await store.beginMutation(input.organizationId, input.mutationId, "plan", async (state) => {
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
		return {
			stripeSubscriptionId: subscription.id,
			stripeCustomerId: projected.stripeCustomerId,
			target: { planId: input.planId, interval: input.interval, claudeAddonPromptSlots: items.addonQuantity },
			stripeUpdateParams: asJsonObject({
				items: updates,
				metadata: {
					[CLOUD_STRIPE_PLAN_METADATA_KEY]: input.planId,
					[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY]: CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
				},
				payment_behavior: "error_if_incomplete",
				proration_behavior: "always_invoice",
				expand: ["items.data.price"],
			}),
		};
	});
	const mutation = requirePendingMutation(result);
	assertRequestedMutation(mutation, "plan", { planId: input.planId, interval: input.interval });
	if (result.state === "applied") {
		if (!mutation.stripeSubscriptionId) throw new Error(`Applied billing mutation ${mutation.id} has no subscription`);
		return { accepted: true, stripeSubscriptionId: mutation.stripeSubscriptionId };
	}
	return executeSubscriptionBillingMutation({ mutation, stripeClient: input.stripeClient, store });
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
	const result = await store.beginMutation(input.organizationId, input.mutationId, "addon", async (state) => {
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
		return {
			stripeSubscriptionId: subscription.id,
			stripeCustomerId: projected.stripeCustomerId,
			target: { planId: items.basePlanId, interval: items.interval, claudeAddonPromptSlots: input.quantity },
			stripeUpdateParams: asJsonObject({
				items: updates,
				payment_behavior: "error_if_incomplete",
				proration_behavior: "always_invoice",
				expand: ["items.data.price"],
			}),
		};
	});
	const mutation = requirePendingMutation(result);
	assertRequestedMutation(mutation, "addon", { claudeAddonPromptSlots: input.quantity });
	if (result.state === "applied") {
		if (!mutation.stripeSubscriptionId) throw new Error(`Applied billing mutation ${mutation.id} has no subscription`);
		return { accepted: true, stripeSubscriptionId: mutation.stripeSubscriptionId };
	}
	return executeSubscriptionBillingMutation({ mutation, stripeClient: input.stripeClient, store });
}

export const CLOUD_BILLING_RECONCILIATION_QUEUE = "cloud-billing-reconciliation";

export async function reconcilePendingCloudBillingMutations(input: {
	stripeClient: Stripe;
	store?: CloudBillingControlStore;
	now?: Date;
	limit?: number;
}): Promise<{ applied: number; failed: number; pending: number; deferred: number }> {
	const store = input.store ?? createDrizzleCloudBillingControlStore();
	const now = input.now ?? new Date();
	const limit = input.limit ?? 25;
	if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
		throw new Error("Billing reconciliation limit must be a whole number between 1 and 100");
	}
	const pending = await store.listPendingMutations(now, limit);
	const result = { applied: 0, failed: 0, pending: 0, deferred: 0 };
	const errors: unknown[] = [];
	for (const mutation of pending) {
		try {
			if (mutation.kind === "checkout") {
				const checkout = await executeCheckoutMutation({ mutation, stripeClient: input.stripeClient, store, now });
				if (checkout.terminal) result.applied++;
				else result.pending++;
			} else {
				await executeSubscriptionBillingMutation({ mutation, stripeClient: input.stripeClient, store, now });
				result.applied++;
			}
		} catch (error) {
			if (error instanceof CloudBillingControlError && error.code === "billing-change-failed") {
				result.failed++;
				continue;
			}
			result.deferred++;
			errors.push(error);
		}
	}
	if (errors.length > 0) {
		throw new AggregateError(errors, `${errors.length} cloud billing mutation(s) remain pending`);
	}
	return result;
}

export interface CloudBillingUsageBucket {
	usageClass: "standard" | "premium" | "custom";
	quotaKey: string;
	periodStart: Date;
	periodEnd: Date;
	limitUnits: number;
	usedUnits: number;
}

export interface CloudBillingReadSnapshot {
	state: CloudBillingMutationState;
	usageBuckets: CloudBillingUsageBucket[];
	entitlementResolution: OrganizationEntitlementSourceResolution;
}

export interface CloudBillingReadStore {
	load(organizationId: string, now: Date): Promise<CloudBillingReadSnapshot>;
}

export interface SerializedCloudBillingView {
	subscription:
		| null
		| (Omit<
				CloudBillingSubscriptionState,
				| "currentPeriodStart"
				| "currentPeriodEnd"
				| "cancelAt"
				| "canceledAt"
				| "endedAt"
				| "delinquentSince"
				| "syncedAt"
		  > & {
				currentPeriodStart: string | null;
				currentPeriodEnd: string | null;
				cancelAt: string | null;
				canceledAt: string | null;
				endedAt: string | null;
				delinquentSince: string | null;
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
	entitlements: OrganizationEntitlementSourceResolution["resolved"];
	lifecycle: {
		access: "allowed" | "denied";
		reason: CloudEntitlementDenialReason | null;
		transitionAt: string | null;
	};
}

export function createDrizzleCloudBillingReadStore(database: typeof db = db): CloudBillingReadStore {
	return {
		load: (organizationId, now) =>
			database.transaction(async (tx) => {
				await lockOrganizationCapacityAndBilling(tx, organizationId);
				const state = await loadCloudBillingMutationState(tx, organizationId, now);
				const usageBuckets = await tx
					.select({
						usageClass: trackingUsageBuckets.usageClass,
						quotaKey: trackingUsageBuckets.quotaKey,
						periodStart: trackingUsageBuckets.periodStart,
						periodEnd: trackingUsageBuckets.periodEnd,
						limitUnits: trackingUsageBuckets.limitUnits,
						usedUnits: trackingUsageBuckets.usedUnits,
					})
					.from(trackingUsageBuckets)
					.where(and(eq(trackingUsageBuckets.organizationId, organizationId), gt(trackingUsageBuckets.periodEnd, now)));
				const source = await createOrganizationEntitlementSourceStore(tx).load(organizationId);
				return {
					state,
					usageBuckets,
					entitlementResolution: resolveOrganizationEntitlementSource(source, now),
				};
			}),
	};
}

export async function getSerializedCloudBillingView(input: {
	organizationId: string;
	now?: Date;
	store?: CloudBillingReadStore;
}): Promise<SerializedCloudBillingView> {
	const now = input.now ?? new Date();
	const snapshot = await (input.store ?? createDrizzleCloudBillingReadStore()).load(input.organizationId, now);
	const { state, usageBuckets, entitlementResolution } = snapshot;
	const lifecycleReason =
		entitlementResolution.resolved.access === "denied" ? entitlementResolution.resolved.reason : null;
	return {
		subscription: state.subscription
			? {
					...state.subscription,
					currentPeriodStart: state.subscription.currentPeriodStart?.toISOString() ?? null,
					currentPeriodEnd: state.subscription.currentPeriodEnd?.toISOString() ?? null,
					cancelAt: state.subscription.cancelAt?.toISOString() ?? null,
					canceledAt: state.subscription.canceledAt?.toISOString() ?? null,
					endedAt: state.subscription.endedAt?.toISOString() ?? null,
					delinquentSince: state.subscription.delinquentSince?.toISOString() ?? null,
					syncedAt: state.subscription.syncedAt.toISOString(),
				}
			: null,
		usage: state.usage,
		usageBuckets: usageBuckets.map((bucket) => ({
			...bucket,
			periodStart: bucket.periodStart.toISOString(),
			periodEnd: bucket.periodEnd.toISOString(),
		})),
		entitlements: entitlementResolution.resolved,
		lifecycle: {
			access: entitlementResolution.resolved.access,
			reason: lifecycleReason,
			transitionAt: entitlementResolution.lifecycleTransitionAt?.toISOString() ?? null,
		},
	};
}
