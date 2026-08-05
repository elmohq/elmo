import { createHash } from "node:crypto";
import {
	type CloudBillingLifecycleDenialReason,
	type CloudBillingLifecycleResolution,
	resolveCloudBillingLifecycle,
} from "@workspace/config/billing-lifecycle";
import {
	type CloudSubscriptionEntitlementSnapshot,
	type ResolvedEntitlements,
	resolveEntitlements,
} from "@workspace/config/entitlements";
import type { DeploymentMode } from "@workspace/config/types";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db";
import {
	organizationBillingMutations,
	organizationBillingSubscriptionItems,
	organizationBillingSubscriptions,
	organizationEntitlementOverrides,
} from "../db/schema";
import { lockOrganizationCapacity } from "./advisory-locks";

type DbConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface OrganizationEntitlementSourceRevision {
	revision: number;
	schemaVersion: number;
	entitlements: Record<string, unknown>;
	effectiveFrom: Date;
	effectiveUntil: Date | null;
	revokedAt: Date | null;
}

export interface OrganizationEntitlementSourceSubscription {
	stripeSubscriptionId: string;
	planId: string | null;
	status: string;
	currentPeriodEnd: Date | null;
	delinquentSince: Date | null;
}

export interface OrganizationEntitlementSourceSnapshot {
	subscription: OrganizationEntitlementSourceSubscription | null;
	claudeAddonPromptSlots: number;
	pendingBillingMutationId: string | null;
	entitlementRevisions: OrganizationEntitlementSourceRevision[];
}

export interface OrganizationEntitlementSourceResolution {
	resolved: ResolvedEntitlements;
	subscription: OrganizationEntitlementSourceSubscription | null;
	claudeAddonPromptSlots: number;
	pendingBillingMutationId: string | null;
	activeCustomRevision: OrganizationEntitlementSourceRevision | null;
	lifecycleDenialReason: CloudBillingLifecycleDenialReason | null;
	lifecycleTransitionAt: Date | null;
	customTransitionAt: Date | null;
	nextTransitionAt: Date | null;
	sourceToken: string;
}

export interface OrganizationEntitlementSourceStore {
	load(organizationId: string): Promise<OrganizationEntitlementSourceSnapshot>;
}

function earlierDate(left: Date | null, right: Date | null): Date | null {
	if (left === null) return right;
	if (right === null) return left;
	return left < right ? left : right;
}

export function nextOrganizationEntitlementTransitionAt(
	revisions: readonly OrganizationEntitlementSourceRevision[],
	now: Date,
): Date | null {
	const candidates = revisions.flatMap((revision) => {
		const end = earlierDate(revision.effectiveUntil, revision.revokedAt);
		if (end !== null && end <= revision.effectiveFrom) return [];
		if (revision.effectiveFrom > now) return [revision.effectiveFrom];
		if (end !== null && end > now) return [end];
		return [];
	});
	return candidates.sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

function activeEntitlementRevision(
	revisions: readonly OrganizationEntitlementSourceRevision[],
	now: Date,
): OrganizationEntitlementSourceRevision | null {
	return (
		revisions
			.filter(
				(revision) =>
					revision.effectiveFrom <= now &&
					(revision.revokedAt === null || revision.revokedAt > now) &&
					(revision.effectiveUntil === null || revision.effectiveUntil > now),
			)
			.sort((left, right) => right.revision - left.revision)[0] ?? null
	);
}

function dateToken(value: Date | null): string | null {
	return value?.toISOString() ?? null;
}

function lifecycleToken(lifecycle: CloudBillingLifecycleResolution | null): Record<string, unknown> | null {
	if (!lifecycle) return null;
	return lifecycle.access === "allowed"
		? { access: lifecycle.access, nextTransitionAt: lifecycle.nextTransitionAt.toISOString() }
		: { access: lifecycle.access, reason: lifecycle.reason };
}

export function resolveOrganizationEntitlementSource(
	source: OrganizationEntitlementSourceSnapshot,
	now: Date,
): OrganizationEntitlementSourceResolution {
	const activeCustomRevision = activeEntitlementRevision(source.entitlementRevisions, now);
	const lifecycle = source.subscription ? resolveCloudBillingLifecycle(source.subscription, now) : null;
	const lifecycleTransitionAt = lifecycle?.access === "allowed" ? lifecycle.nextTransitionAt : null;
	const customTransitionAt = nextOrganizationEntitlementTransitionAt(source.entitlementRevisions, now);
	const nextTransitionAt = earlierDate(lifecycleTransitionAt, customTransitionAt);
	const subscription: CloudSubscriptionEntitlementSnapshot | null = source.subscription?.planId
		? {
				planId: source.subscription.planId,
				status: source.subscription.status,
				currentPeriodEnd: source.subscription.currentPeriodEnd,
				delinquentSince: source.subscription.delinquentSince,
				billingMutationPending: source.pendingBillingMutationId !== null,
				claudeAddonPromptSlots: source.claudeAddonPromptSlots,
				entitlementOverride: activeCustomRevision
					? {
							version: activeCustomRevision.schemaVersion,
							entitlements: activeCustomRevision.entitlements,
						}
					: undefined,
			}
		: null;
	const sourceToken = createHash("sha256")
		.update(
			JSON.stringify({
				version: 2,
				subscription: source.subscription
					? {
							stripeSubscriptionId: source.subscription.stripeSubscriptionId,
							planId: source.subscription.planId,
							status: source.subscription.status,
							currentPeriodEnd: dateToken(source.subscription.currentPeriodEnd),
							delinquentSince: dateToken(source.subscription.delinquentSince),
						}
					: null,
				claudeAddonPromptSlots: source.claudeAddonPromptSlots,
				pendingBillingMutationId: source.pendingBillingMutationId,
				activeCustomRevision: activeCustomRevision
					? {
							revision: activeCustomRevision.revision,
							schemaVersion: activeCustomRevision.schemaVersion,
						}
					: null,
				lifecycle: lifecycleToken(lifecycle),
			}),
		)
		.digest("hex");

	return {
		resolved: resolveEntitlements({ mode: "cloud", subscription, now }),
		subscription: source.subscription,
		claudeAddonPromptSlots: source.claudeAddonPromptSlots,
		pendingBillingMutationId: source.pendingBillingMutationId,
		activeCustomRevision,
		lifecycleDenialReason: lifecycle?.access === "denied" ? lifecycle.reason : null,
		lifecycleTransitionAt,
		customTransitionAt,
		nextTransitionAt,
		sourceToken,
	};
}

export function createOrganizationEntitlementSourceStore(
	conn: DbConnection = db,
): OrganizationEntitlementSourceStore {
	return {
		async load(organizationId) {
			const [subscription] = await conn
				.select({
					stripeSubscriptionId: organizationBillingSubscriptions.stripeSubscriptionId,
					planId: organizationBillingSubscriptions.basePlanKey,
					status: organizationBillingSubscriptions.status,
					currentPeriodEnd: organizationBillingSubscriptions.currentPeriodEnd,
					delinquentSince: organizationBillingSubscriptions.delinquentSince,
				})
				.from(organizationBillingSubscriptions)
				.where(eq(organizationBillingSubscriptions.organizationId, organizationId))
				.limit(1);
			const [premiumItem] = await conn
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
			const entitlementRevisions = await conn
				.select({
					revision: organizationEntitlementOverrides.revision,
					schemaVersion: organizationEntitlementOverrides.schemaVersion,
					entitlements: organizationEntitlementOverrides.entitlements,
					effectiveFrom: organizationEntitlementOverrides.effectiveFrom,
					effectiveUntil: organizationEntitlementOverrides.effectiveUntil,
					revokedAt: organizationEntitlementOverrides.revokedAt,
				})
				.from(organizationEntitlementOverrides)
				.where(eq(organizationEntitlementOverrides.organizationId, organizationId));
			// Read the fence last so a concurrent command cannot become visible
			// between the fence read and an older subscription snapshot.
			const [pendingMutation] = await conn
				.select({ id: organizationBillingMutations.id })
				.from(organizationBillingMutations)
				.where(
					and(
						eq(organizationBillingMutations.organizationId, organizationId),
						eq(organizationBillingMutations.status, "pending"),
					),
				)
				.limit(1);

			return {
				subscription: subscription ?? null,
				claudeAddonPromptSlots: premiumItem?.quantity ?? 0,
				pendingBillingMutationId: pendingMutation?.id ?? null,
				entitlementRevisions,
			};
		},
	};
}

export async function loadOrganizationEntitlementResolution(input: {
	organizationId: string;
	now: Date;
	store?: OrganizationEntitlementSourceStore;
}): Promise<OrganizationEntitlementSourceResolution> {
	if (input.store) {
		return resolveOrganizationEntitlementSource(await input.store.load(input.organizationId), input.now);
	}
	return db.transaction(async (tx) => {
		// Billing projections and custom contracts take this same lock. Holding it
		// across every source read prevents a request from combining rows from two
		// different entitlement generations under READ COMMITTED.
		await lockOrganizationCapacity(tx, input.organizationId);
		const source = await createOrganizationEntitlementSourceStore(tx).load(input.organizationId);
		return resolveOrganizationEntitlementSource(source, input.now);
	});
}

export async function resolveOrganizationEntitlements(input: {
	mode: DeploymentMode;
	organizationId: string;
	now?: Date;
	store?: OrganizationEntitlementSourceStore;
}): Promise<ResolvedEntitlements> {
	if (input.mode !== "cloud") return resolveEntitlements({ mode: input.mode });
	return (
		await loadOrganizationEntitlementResolution({
			organizationId: input.organizationId,
			now: input.now ?? new Date(),
			store: input.store,
		})
	).resolved;
}
