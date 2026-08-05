import { db } from "@workspace/lib/db/db";
import { lockOrganizationCapacityAndBilling } from "@workspace/lib/cloud/advisory-locks";
import { organizationBillingSubscriptions } from "@workspace/lib/db/schema";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import type Stripe from "stripe";
import {
	buildCloudBillingSubscriptionProjection,
	CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY,
	CLOUD_STRIPE_CUSTOM_BILLING_SOURCE,
	CLOUD_STRIPE_PLAN_METADATA_KEY,
	CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE,
} from "./billing-events";
import {
	type CloudBillingSubscriptionProjection,
	createCloudBillingProjectionWriter,
} from "./billing-store";

const ROUTINE_REFRESH_MILLISECONDS = 6 * 60 * 60 * 1_000;
const BOUNDARY_REFRESH_MILLISECONDS = 15 * 60 * 1_000;
const BOUNDARY_LOOKAHEAD_MILLISECONDS = 48 * 60 * 60 * 1_000;
const LIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
	"active",
	"trialing",
	"past_due",
	"unpaid",
	"paused",
	"incomplete",
]);
// Terminal projections still need polling: Stripe can replace a canceled or
// expired subscription without another event ever referencing the old local
// projection. Keeping every Stripe status eligible lets the customer-wide scan
// discover that replacement and recover the organization automatically.
const RECONCILABLE_LOCAL_STATUSES = [
	"active",
	"canceled",
	"incomplete",
	"incomplete_expired",
	"past_due",
	"paused",
	"trialing",
	"unpaid",
	"billing_conflict",
];

export interface CloudSubscriptionReconciliationCandidate {
	organizationId: string;
	stripeSubscriptionId: string;
	stripeCustomerId: string;
	syncedAt: Date;
}

export interface CloudSubscriptionReconciliationStore {
	listDue(now: Date, limit: number): Promise<CloudSubscriptionReconciliationCandidate[]>;
	project(
		candidate: CloudSubscriptionReconciliationCandidate,
		projections: CloudBillingSubscriptionProjection[],
	): Promise<"projected" | "superseded">;
}

function isManagedCloudSubscription(subscription: Stripe.Subscription): boolean {
	const source = subscription.metadata?.[CLOUD_STRIPE_BILLING_SOURCE_METADATA_KEY];
	const plan = subscription.metadata?.[CLOUD_STRIPE_PLAN_METADATA_KEY];
	return (
		(source === CLOUD_STRIPE_SELF_SERVE_BILLING_SOURCE && typeof plan === "string" && plan.length > 0) ||
		(source === CLOUD_STRIPE_CUSTOM_BILLING_SOURCE && plan === "custom")
	);
}

export function selectAuthoritativeCloudSubscriptions(input: {
	currentSubscriptionId: string;
	subscriptions: readonly Stripe.Subscription[];
}): { ordered: Stripe.Subscription[]; conflictIds: string[] } {
	const managed = input.subscriptions.filter(isManagedCloudSubscription);
	const current = managed.find((subscription) => subscription.id === input.currentSubscriptionId);
	if (!current) {
		throw new Error(`Stripe no longer returns projected subscription ${input.currentSubscriptionId} for its customer`);
	}

	const live = managed.filter((subscription) => LIVE_SUBSCRIPTION_STATUSES.has(subscription.status));
	if (live.length > 1) {
		return { ordered: [current], conflictIds: live.map((subscription) => subscription.id).sort() };
	}

	const authoritative = live[0] ?? current;
	if (authoritative.id === current.id) return { ordered: [current], conflictIds: [] };
	return { ordered: [current, authoritative], conflictIds: [] };
}

export function createDrizzleCloudSubscriptionReconciliationStore(
	database: typeof db = db,
): CloudSubscriptionReconciliationStore {
	return {
		async listDue(now, limit) {
			const routineBefore = new Date(now.getTime() - ROUTINE_REFRESH_MILLISECONDS);
			const boundaryBefore = new Date(now.getTime() - BOUNDARY_REFRESH_MILLISECONDS);
			const boundaryAt = new Date(now.getTime() + BOUNDARY_LOOKAHEAD_MILLISECONDS);
			return database
				.select({
					organizationId: organizationBillingSubscriptions.organizationId,
					stripeSubscriptionId: organizationBillingSubscriptions.stripeSubscriptionId,
					stripeCustomerId: organizationBillingSubscriptions.stripeCustomerId,
					syncedAt: organizationBillingSubscriptions.syncedAt,
				})
				.from(organizationBillingSubscriptions)
				.where(
					and(
						inArray(organizationBillingSubscriptions.status, RECONCILABLE_LOCAL_STATUSES),
						or(
							lte(organizationBillingSubscriptions.syncedAt, routineBefore),
							and(
								lte(organizationBillingSubscriptions.syncedAt, boundaryBefore),
								or(
									inArray(organizationBillingSubscriptions.status, [
										"past_due",
										"unpaid",
										"billing_conflict",
									]),
									lte(organizationBillingSubscriptions.currentPeriodEnd, boundaryAt),
								),
							),
						),
					),
				)
				.orderBy(asc(organizationBillingSubscriptions.syncedAt))
				.limit(limit);
		},

		async project(candidate, projections) {
			return database.transaction(async (tx) => {
				await lockOrganizationCapacityAndBilling(tx, candidate.organizationId);
				const [current] = await tx
					.select({ syncedAt: organizationBillingSubscriptions.syncedAt })
					.from(organizationBillingSubscriptions)
					.where(eq(organizationBillingSubscriptions.organizationId, candidate.organizationId))
					.limit(1);
				if (!current || current.syncedAt.getTime() !== candidate.syncedAt.getTime()) return "superseded";
				const writer = createCloudBillingProjectionWriter(tx);
				for (const projection of projections) await writer.replaceSubscription(projection);
				return "projected";
			});
		},
	};
}

async function listCustomerSubscriptions(
	stripeClient: Stripe,
	stripeCustomerId: string,
): Promise<Stripe.Subscription[]> {
	const subscriptions: Stripe.Subscription[] = [];
	for await (const subscription of stripeClient.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
		limit: 100,
		expand: ["data.items.data.price"],
	})) {
		subscriptions.push(subscription);
		if (subscriptions.length > 1_000) throw new Error(`Stripe customer ${stripeCustomerId} has too many subscriptions`);
	}
	return subscriptions;
}

function buildAuthoritativeProjections(input: {
	candidate: CloudSubscriptionReconciliationCandidate;
	subscriptions: readonly Stripe.Subscription[];
	now: Date;
}): CloudBillingSubscriptionProjection[] {
	const selection = selectAuthoritativeCloudSubscriptions({
		currentSubscriptionId: input.candidate.stripeSubscriptionId,
		subscriptions: input.subscriptions,
	});
	return selection.ordered.map((subscription, index) => {
		const projection = buildCloudBillingSubscriptionProjection(subscription, {
			organizationId: input.candidate.organizationId,
			eventId: null,
			eventCreatedAt: input.now,
			deleted: subscription.status === "canceled",
			syncedAt: input.now,
		});
		if (selection.conflictIds.length === 0 || index !== selection.ordered.length - 1) return projection;
		return {
			...projection,
			status: "billing_conflict",
			sourceSnapshot: {
				...projection.sourceSnapshot,
				elmoReconciliation: { conflictingSubscriptionIds: selection.conflictIds },
			},
		};
	});
}

export async function reconcileAuthoritativeCloudSubscriptions(input: {
	stripeClient: Stripe;
	store?: CloudSubscriptionReconciliationStore;
	now?: Date;
	limit?: number;
}): Promise<{ reconciled: number; failed: number }> {
	const now = input.now ?? new Date();
	const limit = input.limit ?? 25;
	if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
		throw new Error("Subscription reconciliation limit must be a whole number between 1 and 100");
	}
	const store = input.store ?? createDrizzleCloudSubscriptionReconciliationStore();
	const candidates = await store.listDue(now, limit);
	const errors: unknown[] = [];
	let reconciled = 0;
	for (const candidate of candidates) {
		try {
			const subscriptions = await listCustomerSubscriptions(input.stripeClient, candidate.stripeCustomerId);
			const projections = buildAuthoritativeProjections({ candidate, subscriptions, now });
			if ((await store.project(candidate, projections)) === "projected") reconciled++;
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length > 0) {
		throw new AggregateError(errors, `${errors.length} authoritative Stripe subscription reconciliation(s) failed`);
	}
	return { reconciled, failed: 0 };
}
