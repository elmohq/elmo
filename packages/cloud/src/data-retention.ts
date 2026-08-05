import { lockOrganizationCapacityAndBilling } from "@workspace/lib/cloud/advisory-locks";
import { purgeCloudOrganizationProductDataInTransaction } from "@workspace/lib/cloud/data-retention-purge";
import { db } from "@workspace/lib/db/db";
import {
	brandAnalysisAdmissions,
	organizationBillingMutations,
	organizationBillingSubscriptions,
	organizationDataRetentionRuns,
	trackingProviderAttempts,
} from "@workspace/lib/db/schema";
import { and, asc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { hasManagedCloudBillingMetadata } from "./billing-metadata";
import type { CloudBillingSubscriptionProjection } from "./billing-store";

export const CLOUD_TERMINAL_DATA_RETENTION_MS = 60 * 24 * 60 * 60 * 1_000;
export const CLOUD_RETENTION_CONFIRMATION_LEAD_MS = 24 * 60 * 60 * 1_000;
export const CLOUD_RETENTION_MINIMUM_CONFIRMATION_MS = 60 * 60 * 1_000;

const OPEN_RETENTION_STATUSES = ["scheduled", "confirmed"] as const;
export type CloudDataRetentionTerminalStatus = "canceled" | "incomplete_expired";

const REMOTE_TERMINAL_STATUSES = new Set<string>(["canceled", "incomplete_expired"]);
const MAX_STRIPE_SUBSCRIPTIONS_PER_CUSTOMER = 1_000;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type RetentionProjection = Pick<
	CloudBillingSubscriptionProjection,
	"organizationId" | "stripeCustomerId" | "stripeSubscriptionId" | "status" | "endedAt" | "syncedAt"
>;

export interface CloudDataRetentionCandidate {
	id: string;
	organizationId: string;
	status: "scheduled" | "confirmed";
	eligibleAt: Date;
	purgeAfter: Date | null;
}

export interface CloudDataRetentionRunSnapshot extends CloudDataRetentionCandidate {
	stripeCustomerId: string;
	stripeSubscriptionId: string;
	sourceSubscriptionStatus: CloudDataRetentionTerminalStatus;
	sourceSubscriptionEndedAt: Date;
	sourceSubscriptionSyncedAt: Date;
}

export interface CloudDataRetentionBillingSnapshot {
	stripeCustomerId: string;
	stripeSubscriptionId: string;
	status: string;
	endedAt: Date | null;
	syncedAt: Date;
}

export type CloudDataRetentionDecision =
	| { action: "confirm" }
	| { action: "purge" }
	| { action: "defer"; reason: string }
	| { action: "cancel"; reason: string };

export type CloudDataRetentionProcessOutcome = "confirmed" | "purged" | "canceled" | "deferred" | "superseded";

export interface CloudDataRetentionStore {
	listDue(now: Date, limit: number): Promise<CloudDataRetentionCandidate[]>;
	withLockedCandidate(
		candidate: CloudDataRetentionCandidate,
		now: Date,
		decide: (state: {
			run: CloudDataRetentionRunSnapshot;
			billing: CloudDataRetentionBillingSnapshot | null;
			hasPendingBillingMutation: boolean;
			hasInFlightProviderWork: boolean;
		}) => Promise<CloudDataRetentionDecision>,
	): Promise<CloudDataRetentionProcessOutcome>;
	recordFailure(candidate: CloudDataRetentionCandidate, now: Date, error: string): Promise<void>;
}

export interface CloudDataRetentionSummary {
	due: number;
	confirmed: number;
	purged: number;
	canceled: number;
	deferred: number;
	superseded: number;
	failed: number;
	errors: unknown[];
}

function isValidTimestamp(value: Date | null | undefined): value is Date {
	return value instanceof Date && Number.isFinite(value.getTime());
}

function isTerminalSubscriptionStatus(status: string): status is CloudDataRetentionTerminalStatus {
	return REMOTE_TERMINAL_STATUSES.has(status);
}

export function nextCloudDataRetentionPurgeAfter(confirmedAt: Date, eligibleAt: Date): Date {
	const minimumPurgeAfter = new Date(confirmedAt.getTime() + CLOUD_RETENTION_MINIMUM_CONFIRMATION_MS);
	return minimumPurgeAfter > eligibleAt ? minimumPurgeAfter : eligibleAt;
}

export { buildRetainedProviderAttemptUpdate } from "@workspace/lib/cloud/data-retention-purge";

function retentionCancelReason(status: string): string {
	return `authoritative-subscription-status:${status}`;
}

/**
 * Keep the retention tombstone synchronized with a projection only after the
 * billing ordering fence has accepted that projection.
 */
export async function applyCloudDataRetentionProjection(
	tx: DbTransaction,
	projection: RetentionProjection,
): Promise<void> {
	const now = projection.syncedAt;
	if (!isValidTimestamp(now)) throw new Error("Retention projection has an invalid synchronization timestamp");
	const openForOrganization = and(
		eq(organizationDataRetentionRuns.organizationId, projection.organizationId),
		inArray(organizationDataRetentionRuns.status, OPEN_RETENTION_STATUSES),
	);

	if (!isTerminalSubscriptionStatus(projection.status)) {
		await tx
			.update(organizationDataRetentionRuns)
			.set({
				status: "canceled",
				canceledAt: now,
				cancelReason: retentionCancelReason(projection.status),
				lastError: null,
				updatedAt: now,
			})
			.where(openForOrganization);
		return;
	}
	if (!isValidTimestamp(projection.endedAt) || projection.endedAt > now) {
		throw new Error(`Terminal subscription ${projection.stripeSubscriptionId} has an invalid ended_at timestamp`);
	}

	await tx
		.update(organizationDataRetentionRuns)
		.set({
			status: "canceled",
			canceledAt: now,
			cancelReason: "superseded-terminal-subscription",
			lastError: null,
			updatedAt: now,
		})
		.where(
			and(
				openForOrganization,
				or(
					ne(organizationDataRetentionRuns.stripeSubscriptionId, projection.stripeSubscriptionId),
					ne(organizationDataRetentionRuns.sourceSubscriptionStatus, projection.status),
					ne(organizationDataRetentionRuns.sourceSubscriptionEndedAt, projection.endedAt),
				),
			),
		);

	const eligibleAt = new Date(projection.endedAt.getTime() + CLOUD_TERMINAL_DATA_RETENTION_MS);
	await tx
		.insert(organizationDataRetentionRuns)
		.values({
			organizationId: projection.organizationId,
			stripeCustomerId: projection.stripeCustomerId,
			stripeSubscriptionId: projection.stripeSubscriptionId,
			sourceSubscriptionStatus: projection.status,
			sourceSubscriptionEndedAt: projection.endedAt,
			eligibleAt,
			sourceSubscriptionSyncedAt: projection.syncedAt,
			status: "scheduled",
			scheduledAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing({
			target: [
				organizationDataRetentionRuns.organizationId,
				organizationDataRetentionRuns.stripeSubscriptionId,
				organizationDataRetentionRuns.sourceSubscriptionEndedAt,
			],
		});
}

function stripeObjectId(value: string | { id: string } | null): string | null {
	return typeof value === "string" ? value : (value?.id ?? null);
}

function stripeTimestamp(value: number | null | undefined): Date | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const date = new Date(value * 1_000);
	return isValidTimestamp(date) ? date : null;
}

export function decideCloudDataRetention(input: {
	run: CloudDataRetentionRunSnapshot;
	billing: CloudDataRetentionBillingSnapshot | null;
	hasPendingBillingMutation?: boolean;
	hasInFlightProviderWork?: boolean;
	subscriptions: readonly Stripe.Subscription[];
}): CloudDataRetentionDecision {
	const { run, billing } = input;
	if (input.hasPendingBillingMutation) return { action: "defer", reason: "pending-billing-mutation" };
	if (input.hasInFlightProviderWork) return { action: "defer", reason: "in-flight-provider-work" };
	if (!billing) return { action: "cancel", reason: "billing-projection-missing" };
	if (
		billing.status !== run.sourceSubscriptionStatus ||
		billing.stripeCustomerId !== run.stripeCustomerId ||
		billing.stripeSubscriptionId !== run.stripeSubscriptionId ||
		!isValidTimestamp(billing.endedAt) ||
		billing.endedAt.getTime() !== run.sourceSubscriptionEndedAt.getTime() ||
		!isValidTimestamp(billing.syncedAt) ||
		billing.syncedAt < run.sourceSubscriptionSyncedAt
	) {
		return { action: "cancel", reason: "billing-projection-changed" };
	}

	const recoverable = input.subscriptions.find((subscription) => !REMOTE_TERMINAL_STATUSES.has(subscription.status));
	if (recoverable) {
		return { action: "cancel", reason: `recoverable-subscription:${recoverable.id}` };
	}

	const managed = input.subscriptions.filter((subscription) => hasManagedCloudBillingMetadata(subscription.metadata));
	const source = managed.find((subscription) => subscription.id === run.stripeSubscriptionId);
	if (source?.status !== run.sourceSubscriptionStatus || stripeObjectId(source.customer) !== run.stripeCustomerId) {
		return { action: "cancel", reason: "authoritative-terminal-subscription-missing" };
	}
	const sourceEndedAt = stripeTimestamp(source.ended_at);
	if (!sourceEndedAt || sourceEndedAt.getTime() !== run.sourceSubscriptionEndedAt.getTime()) {
		return { action: "cancel", reason: "authoritative-terminal-subscription-changed" };
	}

	return run.status === "scheduled" ? { action: "confirm" } : { action: "purge" };
}

export function createDrizzleCloudDataRetentionStore(database: typeof db = db): CloudDataRetentionStore {
	return {
		async listDue(now, limit) {
			const confirmationBoundary = new Date(now.getTime() + CLOUD_RETENTION_CONFIRMATION_LEAD_MS);
			return database
				.select({
					id: organizationDataRetentionRuns.id,
					organizationId: organizationDataRetentionRuns.organizationId,
					status: organizationDataRetentionRuns.status,
					eligibleAt: organizationDataRetentionRuns.eligibleAt,
					purgeAfter: organizationDataRetentionRuns.purgeAfter,
				})
				.from(organizationDataRetentionRuns)
				.where(
					or(
						and(
							eq(organizationDataRetentionRuns.status, "scheduled"),
							lte(organizationDataRetentionRuns.eligibleAt, confirmationBoundary),
						),
						and(
							eq(organizationDataRetentionRuns.status, "confirmed"),
							lte(organizationDataRetentionRuns.purgeAfter, now),
						),
					),
				)
				.orderBy(asc(organizationDataRetentionRuns.eligibleAt))
				.limit(limit) as Promise<CloudDataRetentionCandidate[]>;
		},

		async withLockedCandidate(candidate, now, decide) {
			return database.transaction(async (tx) => {
				await lockOrganizationCapacityAndBilling(tx, candidate.organizationId);
				const [run] = await tx
					.select({
						id: organizationDataRetentionRuns.id,
						organizationId: organizationDataRetentionRuns.organizationId,
						status: organizationDataRetentionRuns.status,
						stripeCustomerId: organizationDataRetentionRuns.stripeCustomerId,
						stripeSubscriptionId: organizationDataRetentionRuns.stripeSubscriptionId,
						sourceSubscriptionStatus: organizationDataRetentionRuns.sourceSubscriptionStatus,
						sourceSubscriptionEndedAt: organizationDataRetentionRuns.sourceSubscriptionEndedAt,
						eligibleAt: organizationDataRetentionRuns.eligibleAt,
						purgeAfter: organizationDataRetentionRuns.purgeAfter,
						sourceSubscriptionSyncedAt: organizationDataRetentionRuns.sourceSubscriptionSyncedAt,
					})
					.from(organizationDataRetentionRuns)
					.where(
						and(
							eq(organizationDataRetentionRuns.id, candidate.id),
							eq(organizationDataRetentionRuns.organizationId, candidate.organizationId),
							inArray(organizationDataRetentionRuns.status, OPEN_RETENTION_STATUSES),
						),
					)
					.limit(1);
				if (!run) return "superseded";
				if (run.status === "scheduled") {
					const confirmationBoundary = new Date(now.getTime() + CLOUD_RETENTION_CONFIRMATION_LEAD_MS);
					if (run.eligibleAt > confirmationBoundary) return "superseded";
				} else if (!run.purgeAfter || run.purgeAfter > now) {
					return "superseded";
				}

				const [billing = null] = await tx
					.select({
						stripeCustomerId: organizationBillingSubscriptions.stripeCustomerId,
						stripeSubscriptionId: organizationBillingSubscriptions.stripeSubscriptionId,
						status: organizationBillingSubscriptions.status,
						endedAt: organizationBillingSubscriptions.endedAt,
						syncedAt: organizationBillingSubscriptions.syncedAt,
					})
					.from(organizationBillingSubscriptions)
					.where(eq(organizationBillingSubscriptions.organizationId, candidate.organizationId))
					.limit(1);
				// Checkout stays pending until its resulting subscription is projected,
				// including when the hosted session already completed. Checking this
				// durable fence under the same lock closes the recovery-vs-purge race.
				const [pendingMutation] = await tx
					.select({ id: organizationBillingMutations.id })
					.from(organizationBillingMutations)
					.where(
						and(
							eq(organizationBillingMutations.organizationId, candidate.organizationId),
							eq(organizationBillingMutations.status, "pending"),
						),
					)
					.limit(1);
				const [runningBrandAnalysis] = await tx
					.select({ id: brandAnalysisAdmissions.jobId })
					.from(brandAnalysisAdmissions)
					.where(
						and(
							eq(brandAnalysisAdmissions.organizationId, candidate.organizationId),
							eq(brandAnalysisAdmissions.status, "running"),
						),
					)
					.limit(1);
				const [startedTrackingAttempt] = await tx
					.select({ id: trackingProviderAttempts.id })
					.from(trackingProviderAttempts)
					.where(
						and(
							eq(trackingProviderAttempts.organizationId, candidate.organizationId),
							eq(trackingProviderAttempts.status, "started"),
						),
					)
					.limit(1);
				const decision = await decide({
					run: run as CloudDataRetentionRunSnapshot,
					billing,
					hasPendingBillingMutation: pendingMutation !== undefined,
					hasInFlightProviderWork: runningBrandAnalysis !== undefined || startedTrackingAttempt !== undefined,
				});

				if (decision.action === "cancel") {
					await tx
						.update(organizationDataRetentionRuns)
						.set({
							status: "canceled",
							canceledAt: now,
							cancelReason: decision.reason,
							checkAttemptCount: sql`${organizationDataRetentionRuns.checkAttemptCount} + 1`,
							lastCheckedAt: now,
							lastError: null,
							updatedAt: now,
						})
						.where(eq(organizationDataRetentionRuns.id, run.id));
					return "canceled";
				}

				if (decision.action === "confirm") {
					if (run.status !== "scheduled") throw new Error(`Retention run ${run.id} cannot be confirmed twice`);
					const purgeAfter = nextCloudDataRetentionPurgeAfter(now, run.eligibleAt);
					await tx
						.update(organizationDataRetentionRuns)
						.set({
							status: "confirmed",
							confirmedAt: now,
							purgeAfter,
							checkAttemptCount: sql`${organizationDataRetentionRuns.checkAttemptCount} + 1`,
							lastCheckedAt: now,
							lastError: null,
							updatedAt: now,
						})
						.where(eq(organizationDataRetentionRuns.id, run.id));
					return "confirmed";
				}

				if (decision.action === "defer") {
					await tx
						.update(organizationDataRetentionRuns)
						.set({
							checkAttemptCount: sql`${organizationDataRetentionRuns.checkAttemptCount} + 1`,
							lastCheckedAt: now,
							lastError: null,
							updatedAt: now,
						})
						.where(eq(organizationDataRetentionRuns.id, run.id));
					return "deferred";
				}

				if (run.status !== "confirmed") throw new Error(`Retention run ${run.id} was not durably confirmed`);
				const purgeSummary = await purgeCloudOrganizationProductDataInTransaction(tx, {
					organizationId: run.organizationId,
					retentionRunId: run.id,
					now,
				});
				await tx
					.update(organizationDataRetentionRuns)
					.set({
						status: "purged",
						purgedAt: now,
						purgeSummary,
						checkAttemptCount: sql`${organizationDataRetentionRuns.checkAttemptCount} + 1`,
						lastCheckedAt: now,
						lastError: null,
						updatedAt: now,
					})
					.where(eq(organizationDataRetentionRuns.id, run.id));
				return "purged";
			});
		},

		async recordFailure(candidate, now, error) {
			await database.transaction(async (tx) => {
				await lockOrganizationCapacityAndBilling(tx, candidate.organizationId);
				await tx
					.update(organizationDataRetentionRuns)
					.set({
						checkAttemptCount: sql`${organizationDataRetentionRuns.checkAttemptCount} + 1`,
						lastCheckedAt: now,
						lastError: error.slice(0, 10_000),
						updatedAt: now,
					})
					.where(
						and(
							eq(organizationDataRetentionRuns.id, candidate.id),
							eq(organizationDataRetentionRuns.organizationId, candidate.organizationId),
							inArray(organizationDataRetentionRuns.status, OPEN_RETENTION_STATUSES),
						),
					);
			});
		},
	};
}

async function listStripeCustomerSubscriptions(
	stripeClient: Stripe,
	stripeCustomerId: string,
): Promise<Stripe.Subscription[]> {
	const subscriptions: Stripe.Subscription[] = [];
	for await (const subscription of stripeClient.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
		limit: 100,
	})) {
		subscriptions.push(subscription);
		if (subscriptions.length > MAX_STRIPE_SUBSCRIPTIONS_PER_CUSTOMER) {
			throw new Error(`Stripe customer ${stripeCustomerId} has too many subscriptions`);
		}
	}
	return subscriptions;
}

function retentionErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function reconcileCloudDataRetention(input: {
	stripeClient: Stripe;
	store?: CloudDataRetentionStore;
	now?: Date;
	limit?: number;
}): Promise<CloudDataRetentionSummary> {
	const now = input.now ?? new Date();
	const limit = input.limit ?? 25;
	if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 100) {
		throw new Error("Data-retention limit must be a whole number between 1 and 100");
	}
	const store = input.store ?? createDrizzleCloudDataRetentionStore();
	const candidates = await store.listDue(now, limit);
	const summary: CloudDataRetentionSummary = {
		due: candidates.length,
		confirmed: 0,
		purged: 0,
		canceled: 0,
		deferred: 0,
		superseded: 0,
		failed: 0,
		errors: [],
	};

	for (const candidate of candidates) {
		try {
			const outcome = await store.withLockedCandidate(
				candidate,
				now,
				async ({ run, billing, hasPendingBillingMutation, hasInFlightProviderWork }) => {
					if (hasPendingBillingMutation || hasInFlightProviderWork) {
						return decideCloudDataRetention({
							run,
							billing,
							hasPendingBillingMutation,
							hasInFlightProviderWork,
							subscriptions: [],
						});
					}
					const subscriptions = await listStripeCustomerSubscriptions(input.stripeClient, run.stripeCustomerId);
					return decideCloudDataRetention({ run, billing, subscriptions });
				},
			);
			summary[outcome]++;
		} catch (error) {
			summary.failed++;
			summary.errors.push(error);
			try {
				await store.recordFailure(candidate, now, retentionErrorMessage(error));
			} catch (persistenceError) {
				summary.errors.push(
					new AggregateError(
						[error, persistenceError],
						`Retention run ${candidate.id} failed and its failure state could not be persisted`,
					),
				);
			}
		}
	}

	return summary;
}
