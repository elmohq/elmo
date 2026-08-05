import { db } from "@workspace/lib/db/db";
import {
	member,
	organization,
	organizationBillingSubscriptionItems,
	organizationBillingSubscriptions,
	stripeWebhookEvents,
} from "@workspace/lib/db/schema";
import { and, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

export interface CloudStripeWebhookEnvelope {
	id: string;
	type: string;
	apiVersion: string | null;
	livemode: boolean;
	createdAt: Date;
	payload: Record<string, unknown>;
}

export interface CloudBillingSubscriptionItemProjection {
	stripeSubscriptionItemId: string;
	stripePriceId: string;
	stripePriceLookupKey: string | null;
	type: "base_plan" | "premium_addon" | "custom";
	quantity: number;
	active: boolean;
	sourceSnapshot: Record<string, unknown>;
}

export interface CloudBillingSubscriptionProjection {
	organizationId: string;
	stripeSubscriptionId: string;
	stripeCustomerId: string;
	status: string;
	basePlanKey: string;
	billingInterval: "month" | "year";
	currency: string;
	currentPeriodStart: Date;
	currentPeriodEnd: Date;
	cancelAtPeriodEnd: boolean;
	cancelAt: Date | null;
	canceledAt: Date | null;
	endedAt: Date | null;
	sourceEventId: string;
	sourceEventCreatedAt: Date;
	sourceSnapshot: Record<string, unknown>;
	syncedAt: Date;
	items: CloudBillingSubscriptionItemProjection[];
}

export interface CloudStripeWebhookClaim {
	attemptCount: number;
}

export type CloudStripeWebhookClaimResult =
	| { state: "claimed"; claim: CloudStripeWebhookClaim }
	| { state: "complete" | "processing" };

export interface CloudBillingProjectionWriter {
	replaceSubscription(projection: CloudBillingSubscriptionProjection): Promise<{ applied: boolean }>;
}

export interface CloudBillingStore {
	hasOrganizationMembership(organizationId: string, userId: string): Promise<boolean>;
	findOrganizationIdByStripeCustomerId(stripeCustomerId: string): Promise<string | null>;
	claimWebhookEvent(event: CloudStripeWebhookEnvelope, now: Date): Promise<CloudStripeWebhookClaimResult>;
	finishWebhookEvent(
		eventId: string,
		claim: CloudStripeWebhookClaim,
		status: "processed" | "ignored",
		now: Date,
	): Promise<void>;
	failWebhookEvent(eventId: string, claim: CloudStripeWebhookClaim, error: string, now: Date): Promise<void>;
	withOrganizationProjection<T>(
		organizationId: string,
		operation: (writer: CloudBillingProjectionWriter) => Promise<T>,
	): Promise<T>;
}

type DbConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const PROCESSING_LEASE_MILLISECONDS = 5 * 60 * 1000;
const ACCESS_GRANTING_STATUSES = new Set(["active", "trialing"]);

function grantsAccess(status: string): boolean {
	return ACCESS_GRANTING_STATUSES.has(status);
}

export interface ExistingCloudBillingProjection {
	stripeSubscriptionId: string;
	status: string;
	sourceEventCreatedAt: Date | null;
}

export type CloudBillingProjectionDecision = "apply" | "ignore" | "conflict";

export function decideCloudBillingProjectionReplacement(
	current: ExistingCloudBillingProjection | undefined,
	candidate: Pick<CloudBillingSubscriptionProjection, "stripeSubscriptionId" | "status" | "sourceEventCreatedAt">,
): CloudBillingProjectionDecision {
	if (!current || current.stripeSubscriptionId === candidate.stripeSubscriptionId) return "apply";
	if (
		current.sourceEventCreatedAt &&
		current.sourceEventCreatedAt.getTime() > candidate.sourceEventCreatedAt.getTime()
	) {
		return "ignore";
	}
	if (grantsAccess(current.status) && !grantsAccess(candidate.status)) return "ignore";
	if (grantsAccess(current.status) && grantsAccess(candidate.status)) return "conflict";
	return "apply";
}

function createProjectionWriter(conn: DbConnection): CloudBillingProjectionWriter {
	return {
		async replaceSubscription(projection) {
			const [current] = await conn
				.select({
					stripeSubscriptionId: organizationBillingSubscriptions.stripeSubscriptionId,
					status: organizationBillingSubscriptions.status,
					sourceEventCreatedAt: organizationBillingSubscriptions.sourceEventCreatedAt,
				})
				.from(organizationBillingSubscriptions)
				.where(eq(organizationBillingSubscriptions.organizationId, projection.organizationId))
				.limit(1);

			const replacementDecision = decideCloudBillingProjectionReplacement(current, projection);
			if (replacementDecision === "ignore") return { applied: false };
			if (replacementDecision === "conflict") {
				throw new Error(`Stripe customer ${projection.stripeCustomerId} has multiple access-granting subscriptions`);
			}

			if (projection.items.length > 0) {
				const itemIds = projection.items.map((item) => item.stripeSubscriptionItemId);
				const existingItems = await conn
					.select({
						stripeSubscriptionItemId: organizationBillingSubscriptionItems.stripeSubscriptionItemId,
						organizationId: organizationBillingSubscriptionItems.organizationId,
					})
					.from(organizationBillingSubscriptionItems)
					.where(inArray(organizationBillingSubscriptionItems.stripeSubscriptionItemId, itemIds));
				const foreignItem = existingItems.find((item) => item.organizationId !== projection.organizationId);
				if (foreignItem) {
					throw new Error(
						`Stripe subscription item ${foreignItem.stripeSubscriptionItemId} is already assigned to another organization`,
					);
				}
			}

			await conn
				.insert(organizationBillingSubscriptions)
				.values({
					organizationId: projection.organizationId,
					stripeSubscriptionId: projection.stripeSubscriptionId,
					stripeCustomerId: projection.stripeCustomerId,
					status: projection.status,
					basePlanKey: projection.basePlanKey,
					billingInterval: projection.billingInterval,
					currency: projection.currency,
					currentPeriodStart: projection.currentPeriodStart,
					currentPeriodEnd: projection.currentPeriodEnd,
					cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
					cancelAt: projection.cancelAt,
					canceledAt: projection.canceledAt,
					endedAt: projection.endedAt,
					sourceEventId: projection.sourceEventId,
					sourceEventCreatedAt: projection.sourceEventCreatedAt,
					sourceSnapshot: projection.sourceSnapshot,
					syncedAt: projection.syncedAt,
					createdAt: projection.syncedAt,
					updatedAt: projection.syncedAt,
				})
				.onConflictDoUpdate({
					target: organizationBillingSubscriptions.organizationId,
					set: {
						stripeSubscriptionId: projection.stripeSubscriptionId,
						stripeCustomerId: projection.stripeCustomerId,
						status: projection.status,
						basePlanKey: projection.basePlanKey,
						billingInterval: projection.billingInterval,
						currency: projection.currency,
						currentPeriodStart: projection.currentPeriodStart,
						currentPeriodEnd: projection.currentPeriodEnd,
						cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
						cancelAt: projection.cancelAt,
						canceledAt: projection.canceledAt,
						endedAt: projection.endedAt,
						sourceEventId: projection.sourceEventId,
						sourceEventCreatedAt: projection.sourceEventCreatedAt,
						sourceSnapshot: projection.sourceSnapshot,
						syncedAt: projection.syncedAt,
						updatedAt: projection.syncedAt,
					},
				});

			await conn
				.update(organizationBillingSubscriptionItems)
				.set({
					active: false,
					sourceEventId: projection.sourceEventId,
					sourceEventCreatedAt: projection.sourceEventCreatedAt,
					updatedAt: projection.syncedAt,
				})
				.where(
					and(
						eq(organizationBillingSubscriptionItems.organizationId, projection.organizationId),
						eq(organizationBillingSubscriptionItems.active, true),
					),
				);

			for (const item of projection.items) {
				await conn
					.insert(organizationBillingSubscriptionItems)
					.values({
						...item,
						organizationId: projection.organizationId,
						sourceEventId: projection.sourceEventId,
						sourceEventCreatedAt: projection.sourceEventCreatedAt,
						createdAt: projection.syncedAt,
						updatedAt: projection.syncedAt,
					})
					.onConflictDoUpdate({
						target: organizationBillingSubscriptionItems.stripeSubscriptionItemId,
						set: {
							stripePriceId: item.stripePriceId,
							stripePriceLookupKey: item.stripePriceLookupKey,
							type: item.type,
							quantity: item.quantity,
							active: item.active,
							sourceEventId: projection.sourceEventId,
							sourceEventCreatedAt: projection.sourceEventCreatedAt,
							sourceSnapshot: item.sourceSnapshot,
							updatedAt: projection.syncedAt,
						},
					});
			}

			return { applied: true };
		},
	};
}

export function createDrizzleCloudBillingStore(database: typeof db = db): CloudBillingStore {
	return {
		async hasOrganizationMembership(organizationId, userId) {
			const [membership] = await database
				.select({ id: member.id })
				.from(member)
				.where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
				.limit(1);
			return membership !== undefined;
		},

		async findOrganizationIdByStripeCustomerId(stripeCustomerId) {
			const [result] = await database
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.stripeCustomerId, stripeCustomerId))
				.limit(1);
			return result?.id ?? null;
		},

		async claimWebhookEvent(event, now) {
			await database
				.insert(stripeWebhookEvents)
				.values({
					id: event.id,
					type: event.type,
					apiVersion: event.apiVersion,
					livemode: event.livemode,
					stripeCreatedAt: event.createdAt,
					payload: event.payload,
					status: "pending",
					nextAttemptAt: now,
					receivedAt: now,
					updatedAt: now,
				})
				.onConflictDoNothing();

			const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MILLISECONDS);
			const [claimed] = await database
				.update(stripeWebhookEvents)
				.set({
					status: "processing",
					attemptCount: sql`${stripeWebhookEvents.attemptCount} + 1`,
					processingStartedAt: now,
					processedAt: null,
					lastError: null,
					updatedAt: now,
				})
				.where(
					and(
						eq(stripeWebhookEvents.id, event.id),
						lte(stripeWebhookEvents.nextAttemptAt, now),
						or(
							inArray(stripeWebhookEvents.status, ["pending", "failed"]),
							and(
								eq(stripeWebhookEvents.status, "processing"),
								or(
									isNull(stripeWebhookEvents.processingStartedAt),
									lt(stripeWebhookEvents.processingStartedAt, staleBefore),
								),
							),
						),
					),
				)
				.returning({ attemptCount: stripeWebhookEvents.attemptCount });

			if (claimed) return { state: "claimed", claim: claimed };

			const [stored] = await database
				.select({ status: stripeWebhookEvents.status })
				.from(stripeWebhookEvents)
				.where(eq(stripeWebhookEvents.id, event.id))
				.limit(1);
			if (!stored) throw new Error(`Stripe webhook event ${event.id} was not persisted`);
			return stored.status === "processed" || stored.status === "ignored"
				? { state: "complete" }
				: { state: "processing" };
		},

		async finishWebhookEvent(eventId, claim, status, now) {
			await database
				.update(stripeWebhookEvents)
				.set({
					status,
					processingStartedAt: null,
					processedAt: now,
					lastError: null,
					updatedAt: now,
				})
				.where(
					and(
						eq(stripeWebhookEvents.id, eventId),
						eq(stripeWebhookEvents.status, "processing"),
						eq(stripeWebhookEvents.attemptCount, claim.attemptCount),
					),
				);
		},

		async failWebhookEvent(eventId, claim, error, now) {
			await database
				.update(stripeWebhookEvents)
				.set({
					status: "failed",
					processingStartedAt: null,
					nextAttemptAt: now,
					lastError: error,
					updatedAt: now,
				})
				.where(
					and(
						eq(stripeWebhookEvents.id, eventId),
						eq(stripeWebhookEvents.status, "processing"),
						eq(stripeWebhookEvents.attemptCount, claim.attemptCount),
					),
				);
		},

		async withOrganizationProjection(organizationId, operation) {
			return database.transaction(async (tx) => {
				await tx.execute(
					sql`select pg_advisory_xact_lock(hashtextextended(${`elmo-cloud-billing:${organizationId}`}, 0))`,
				);
				return operation(createProjectionWriter(tx));
			});
		},
	};
}
