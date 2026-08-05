import {
	type OrganizationEntitlementOverride as EntitlementPayload,
	getClaudeTrackingTargetKey,
	organizationEntitlementOverrideSchema,
} from "@workspace/config/plans";
import { getTrackingTargetKey, parseScrapeTargets } from "@workspace/config/scrape-targets";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import { organization, organizationBillingSubscriptions, organizationEntitlementOverrides, user } from "../db/schema";
import { reconcileOrganizationTrackingEntitlementsInTransaction } from "./entitlement-reconciliation";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CustomEntitlementOperatorErrorCode =
	| "invalid-input"
	| "organization-not-found"
	| "organization-not-custom"
	| "actor-not-found"
	| "revision-conflict"
	| "effective-window-overlap"
	| "revision-not-active"
	| "concurrent-write";

export class CustomEntitlementOperatorError extends Error {
	constructor(
		public readonly code: CustomEntitlementOperatorErrorCode,
		message: string,
	) {
		super(message);
		this.name = "CustomEntitlementOperatorError";
	}
}

export interface EntitlementOverrideRevision {
	id: string;
	organizationId: string;
	revision: number;
	payload: EntitlementPayload;
	effectiveFrom: Date;
	effectiveUntil: Date | null;
	revokedAt: Date | null;
	reason: string;
	createdByUserId: string;
	createdAt: Date;
}

export interface EntitlementOverrideDraft {
	organizationId: string;
	revision: number;
	payload: EntitlementPayload;
	effectiveFrom: Date;
	effectiveUntil: Date | null;
	revokedAt: Date | null;
	reason: string;
	createdByUserId: string;
}

export interface EntitlementOverrideTransactionStore {
	organizationExists(organizationId: string): Promise<boolean>;
	organizationUsesCustomPlan(organizationId: string): Promise<boolean>;
	actorExists(actorUserId: string): Promise<boolean>;
	list(organizationId: string): Promise<EntitlementOverrideRevision[]>;
	insert(draft: EntitlementOverrideDraft): Promise<EntitlementOverrideRevision>;
	setRevocationIfUnscheduled(input: { organizationId: string; revision: number; revokedAt: Date }): Promise<boolean>;
	rescheduleRevocationIfMatches(input: {
		organizationId: string;
		revision: number;
		expectedRevokedAt: Date;
		revokedAt: Date | null;
	}): Promise<boolean>;
	reconcile(organizationId: string, now: Date): Promise<void>;
	availableTrackingTargetKeys(): Promise<ReadonlySet<string>>;
}

export interface EntitlementOverrideStore {
	withOrganizationLock<T>(
		organizationId: string,
		run: (store: EntitlementOverrideTransactionStore) => Promise<T>,
	): Promise<T>;
}

function requiredText(value: string, label: string): string {
	const normalized = value.trim();
	if (!normalized) throw new CustomEntitlementOperatorError("invalid-input", `${label} must not be empty`);
	return normalized;
}

function validDate(value: Date, label: string): Date {
	if (Number.isNaN(value.getTime())) {
		throw new CustomEntitlementOperatorError("invalid-input", `${label} must be a valid date`);
	}
	return value;
}

export function assertCustomEntitlementTargetsAvailable(
	payload: EntitlementPayload,
	availableTargetKeys: ReadonlySet<string>,
): void {
	const required = payload.entitlements.trackingTargets.targets.map((target) => target.targetKey);
	if (payload.entitlements.claudeTracking.enabled) {
		required.push(...payload.entitlements.claudeTracking.allowedModes.map(getClaudeTrackingTargetKey));
	}
	const missing = [...new Set(required.filter((targetKey) => !availableTargetKeys.has(targetKey)))].sort();
	if (missing.length > 0) {
		throw new CustomEntitlementOperatorError(
			"invalid-input",
			`Custom entitlement targets are not configured in SCRAPE_TARGETS: ${missing.join(", ")}`,
		);
	}
}

async function validateDraftTargets(
	transaction: EntitlementOverrideTransactionStore,
	draft: EntitlementOverrideDraft,
): Promise<void> {
	assertCustomEntitlementTargetsAvailable(draft.payload, await transaction.availableTrackingTargetKeys());
}

export function effectiveWindowsOverlap(
	left: { effectiveFrom: Date; effectiveUntil: Date | null },
	right: { effectiveFrom: Date; effectiveUntil: Date | null },
): boolean {
	const leftStartsBeforeRightEnds = right.effectiveUntil === null || left.effectiveFrom < right.effectiveUntil;
	const rightStartsBeforeLeftEnds = left.effectiveUntil === null || right.effectiveFrom < left.effectiveUntil;
	return leftStartsBeforeRightEnds && rightStartsBeforeLeftEnds;
}

function earlierDate(left: Date | null, right: Date | null): Date | null {
	if (left === null) return right;
	if (right === null) return left;
	return left < right ? left : right;
}

export function entitlementRevisionWindow(revision: EntitlementOverrideRevision): {
	effectiveFrom: Date;
	effectiveUntil: Date | null;
} | null {
	const effectiveUntil = earlierDate(revision.effectiveUntil, revision.revokedAt);
	if (effectiveUntil !== null && effectiveUntil <= revision.effectiveFrom) return null;
	return { effectiveFrom: revision.effectiveFrom, effectiveUntil };
}

export function isEntitlementRevisionEffectiveAt(revision: EntitlementOverrideRevision, at: Date): boolean {
	const window = entitlementRevisionWindow(revision);
	return Boolean(
		window && window.effectiveFrom <= at && (window.effectiveUntil === null || window.effectiveUntil > at),
	);
}

export function latestEntitlementRevision(revisions: EntitlementOverrideRevision[]): number {
	return revisions.reduce((latest, revision) => Math.max(latest, revision.revision), 0);
}

export function currentEntitlementRevision(
	revisions: EntitlementOverrideRevision[],
	at: Date,
): EntitlementOverrideRevision | null {
	return (
		revisions
			.filter((revision) => isEntitlementRevisionEffectiveAt(revision, at))
			.sort((left, right) => right.revision - left.revision)[0] ?? null
	);
}

export function planEntitlementOverrideAppend(input: {
	organizationId: string;
	actorUserId: string;
	reason: string;
	payload: unknown;
	effectiveFrom: Date;
	effectiveUntil?: Date | null;
	expectedLatestRevision: number;
	existing: EntitlementOverrideRevision[];
}): EntitlementOverrideDraft {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const createdByUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	const effectiveFrom = validDate(input.effectiveFrom, "effectiveFrom");
	const effectiveUntil = input.effectiveUntil ? validDate(input.effectiveUntil, "effectiveUntil") : null;
	if (effectiveUntil && effectiveUntil <= effectiveFrom) {
		throw new CustomEntitlementOperatorError("invalid-input", "effectiveUntil must be after effectiveFrom");
	}

	const parsedPayload = organizationEntitlementOverrideSchema.safeParse(input.payload);
	if (!parsedPayload.success) {
		throw new CustomEntitlementOperatorError(
			"invalid-input",
			`Invalid custom entitlement payload: ${parsedPayload.error.issues
				.map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
				.join("; ")}`,
		);
	}

	const latestRevision = latestEntitlementRevision(input.existing);
	if (!Number.isSafeInteger(input.expectedLatestRevision) || input.expectedLatestRevision < 0) {
		throw new CustomEntitlementOperatorError("invalid-input", "Expected revision must be a non-negative integer");
	}
	if (latestRevision !== input.expectedLatestRevision) {
		throw new CustomEntitlementOperatorError(
			"revision-conflict",
			`Expected latest revision ${input.expectedLatestRevision}, but found ${latestRevision}`,
		);
	}

	const requestedWindow = { effectiveFrom, effectiveUntil };
	const overlap = input.existing.find((revision) => {
		const existingWindow = entitlementRevisionWindow(revision);
		return existingWindow !== null && effectiveWindowsOverlap(existingWindow, requestedWindow);
	});
	if (overlap) {
		throw new CustomEntitlementOperatorError(
			"effective-window-overlap",
			`The requested effective window overlaps effective revision ${overlap.revision}`,
		);
	}

	return {
		organizationId,
		revision: latestRevision + 1,
		payload: parsedPayload.data,
		effectiveFrom,
		effectiveUntil,
		revokedAt: null,
		reason,
		createdByUserId,
	};
}

const REPLACEMENT_REASON = /^replace:predecessor=(\d+); /;

function replacementReason(predecessorRevision: number, reason: string): string {
	return `replace:predecessor=${predecessorRevision}; ${reason}`;
}

function replacementPredecessorRevision(reason: string): number | null {
	const match = REPLACEMENT_REASON.exec(reason);
	if (!match?.[1]) return null;
	const revision = Number(match[1]);
	return Number.isSafeInteger(revision) && revision > 0 ? revision : null;
}

export interface EntitlementOverrideReplacementPlan {
	target: EntitlementOverrideRevision;
	successor: EntitlementOverrideDraft;
	transitionAt: Date;
}

export function planEntitlementOverrideReplacement(input: {
	organizationId: string;
	actorUserId: string;
	reason: string;
	predecessorRevision: number;
	payload: unknown;
	now: Date;
	transitionAt: Date;
	effectiveUntil?: Date | null;
	expectedLatestRevision: number;
	existing: EntitlementOverrideRevision[];
}): EntitlementOverrideReplacementPlan {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const actorUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	const now = validDate(input.now, "now");
	const transitionAt = validDate(input.transitionAt, "transitionAt");
	if (transitionAt < now) {
		throw new CustomEntitlementOperatorError("invalid-input", "transitionAt cannot be in the past");
	}
	if (!Number.isSafeInteger(input.predecessorRevision) || input.predecessorRevision <= 0) {
		throw new CustomEntitlementOperatorError("invalid-input", "Predecessor revision must be a positive integer");
	}

	const target = input.existing.find((revision) => revision.revision === input.predecessorRevision);
	if (
		!target ||
		target.revokedAt !== null ||
		currentEntitlementRevision(input.existing, now)?.revision !== target.revision
	) {
		throw new CustomEntitlementOperatorError(
			"revision-not-active",
			`Revision ${input.predecessorRevision} is not the active unscheduled contract at ${now.toISOString()}`,
		);
	}
	if (target.effectiveUntil !== null && target.effectiveUntil <= transitionAt) {
		throw new CustomEntitlementOperatorError(
			"revision-not-active",
			`Revision ${target.revision} does not remain active through ${transitionAt.toISOString()}`,
		);
	}

	const existingAfterScheduledEnd = input.existing.map((revision) =>
		revision.revision === target.revision ? { ...revision, revokedAt: transitionAt } : revision,
	);
	const successor = planEntitlementOverrideAppend({
		organizationId,
		actorUserId,
		reason: replacementReason(target.revision, reason),
		payload: input.payload,
		effectiveFrom: transitionAt,
		effectiveUntil: input.effectiveUntil,
		expectedLatestRevision: input.expectedLatestRevision,
		existing: existingAfterScheduledEnd,
	});
	return { target, successor, transitionAt };
}

export interface EntitlementOverrideRevocationPlan {
	target: EntitlementOverrideRevision;
	audit: EntitlementOverrideDraft;
	action: "cancel" | "revoke";
	restorePredecessor: {
		revision: number;
		expectedRevokedAt: Date;
		revokedAt: Date | null;
	} | null;
}

export function planEntitlementOverrideRevocation(input: {
	organizationId: string;
	actorUserId: string;
	reason: string;
	revision: number;
	now: Date;
	expectedLatestRevision: number;
	existing: EntitlementOverrideRevision[];
}): EntitlementOverrideRevocationPlan {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const createdByUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	const now = validDate(input.now, "now");
	if (!Number.isSafeInteger(input.revision) || input.revision <= 0) {
		throw new CustomEntitlementOperatorError("invalid-input", "Revision must be a positive integer");
	}

	const latestRevision = latestEntitlementRevision(input.existing);
	if (!Number.isSafeInteger(input.expectedLatestRevision) || input.expectedLatestRevision < 0) {
		throw new CustomEntitlementOperatorError("invalid-input", "Expected revision must be a non-negative integer");
	}
	if (latestRevision !== input.expectedLatestRevision) {
		throw new CustomEntitlementOperatorError(
			"revision-conflict",
			`Expected latest revision ${input.expectedLatestRevision}, but found ${latestRevision}`,
		);
	}
	const target = input.existing.find((revision) => revision.revision === input.revision);
	if (!target || target.revokedAt !== null || (target.effectiveUntil !== null && target.effectiveUntil <= now)) {
		throw new CustomEntitlementOperatorError(
			"revision-not-active",
			`Revision ${input.revision} is expired, already revoked, or does not exist at ${now.toISOString()}`,
		);
	}
	const isFuture = target.effectiveFrom > now;
	if (!isFuture && currentEntitlementRevision(input.existing, now)?.revision !== target.revision) {
		throw new CustomEntitlementOperatorError(
			"revision-not-active",
			`Revision ${input.revision} is not the active contract at ${now.toISOString()}`,
		);
	}

	let restorePredecessor: EntitlementOverrideRevocationPlan["restorePredecessor"] = null;
	const predecessorRevision = isFuture ? replacementPredecessorRevision(target.reason) : null;
	if (predecessorRevision !== null) {
		const predecessor = input.existing.find((revision) => revision.revision === predecessorRevision);
		if (
			!predecessor?.revokedAt ||
			predecessor.revokedAt.getTime() !== target.effectiveFrom.getTime() ||
			(predecessor.effectiveUntil !== null && predecessor.effectiveUntil <= target.effectiveFrom)
		) {
			throw new CustomEntitlementOperatorError(
				"invalid-input",
				`Revision ${target.revision} has inconsistent replacement audit metadata`,
			);
		}
		const nextRevisionStart = input.existing
			.filter(
				(revision) =>
					revision.revision !== target.revision &&
					revision.revision !== predecessor.revision &&
					entitlementRevisionWindow(revision) !== null &&
					revision.effectiveFrom > target.effectiveFrom,
			)
			.map((revision) => revision.effectiveFrom)
			.sort((left, right) => left.getTime() - right.getTime())[0];
		const restoredRevokedAt =
			nextRevisionStart && (predecessor.effectiveUntil === null || nextRevisionStart < predecessor.effectiveUntil)
				? nextRevisionStart
				: null;
		restorePredecessor = {
			revision: predecessor.revision,
			expectedRevokedAt: target.effectiveFrom,
			revokedAt: restoredRevokedAt,
		};
	}

	const auditAction = isFuture ? "cancel" : "revoke";
	const restoreAudit = restorePredecessor ? `;restore-predecessor=${restorePredecessor.revision}` : "";

	return {
		target,
		restorePredecessor,
		action: auditAction,
		// The schema has lifecycle metadata but no mutable revocation-reason
		// columns. Append an immediately-revoked audit revision so the actor and
		// reason are durable without changing the target revision's payload.
		audit: {
			organizationId,
			revision: latestRevision + 1,
			payload: target.payload,
			effectiveFrom: now,
			effectiveUntil: null,
			revokedAt: now,
			reason: `${auditAction}:revision=${target.revision}${restoreAudit}; ${reason}`,
			createdByUserId,
		},
	};
}

async function assertOrganizationAndActor(
	store: EntitlementOverrideTransactionStore,
	organizationId: string,
	actorUserId?: string,
): Promise<void> {
	if (!(await store.organizationExists(organizationId))) {
		throw new CustomEntitlementOperatorError("organization-not-found", `Organization ${organizationId} does not exist`);
	}
	if (actorUserId) {
		if (!(await store.organizationUsesCustomPlan(organizationId))) {
			throw new CustomEntitlementOperatorError(
				"organization-not-custom",
				`Organization ${organizationId} does not have a projected custom subscription`,
			);
		}
		if (!(await store.actorExists(actorUserId))) {
			throw new CustomEntitlementOperatorError("actor-not-found", `Actor user ${actorUserId} does not exist`);
		}
	}
}

export async function previewEntitlementOverrideAppend(
	input: Omit<Parameters<typeof planEntitlementOverrideAppend>[0], "existing" | "expectedLatestRevision">,
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<{ draft: EntitlementOverrideDraft; latestRevision: number }> {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const actorUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	return store.withOrganizationLock(organizationId, async (transaction) => {
		await assertOrganizationAndActor(transaction, organizationId, actorUserId);
		const existing = await transaction.list(organizationId);
		const latestRevision = latestEntitlementRevision(existing);
		const draft = planEntitlementOverrideAppend({
			...input,
			organizationId,
			actorUserId,
			reason,
			existing,
			expectedLatestRevision: latestRevision,
		});
		await validateDraftTargets(transaction, draft);
		return {
			draft,
			latestRevision,
		};
	});
}

export async function appendEntitlementOverride(
	input: Omit<Parameters<typeof planEntitlementOverrideAppend>[0], "existing">,
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<EntitlementOverrideRevision> {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const actorUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	return store.withOrganizationLock(organizationId, async (transaction) => {
		await assertOrganizationAndActor(transaction, organizationId, actorUserId);
		const existing = await transaction.list(organizationId);
		const draft = planEntitlementOverrideAppend({ ...input, organizationId, actorUserId, reason, existing });
		await validateDraftTargets(transaction, draft);
		const inserted = await transaction.insert(draft);
		await transaction.reconcile(organizationId, new Date());
		return inserted;
	});
}

export async function previewEntitlementOverrideReplacement(
	input: Omit<Parameters<typeof planEntitlementOverrideReplacement>[0], "existing" | "expectedLatestRevision">,
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<EntitlementOverrideReplacementPlan & { latestRevision: number }> {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const actorUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	return store.withOrganizationLock(organizationId, async (transaction) => {
		await assertOrganizationAndActor(transaction, organizationId, actorUserId);
		const existing = await transaction.list(organizationId);
		const latestRevision = latestEntitlementRevision(existing);
		const plan = planEntitlementOverrideReplacement({
			...input,
			organizationId,
			actorUserId,
			reason,
			existing,
			expectedLatestRevision: latestRevision,
		});
		await validateDraftTargets(transaction, plan.successor);
		return {
			...plan,
			latestRevision,
		};
	});
}

export async function replaceEntitlementOverride(
	input: Omit<Parameters<typeof planEntitlementOverrideReplacement>[0], "existing">,
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<{ endedRevision: number; successor: EntitlementOverrideRevision; transitionAt: Date }> {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const actorUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	return store.withOrganizationLock(organizationId, async (transaction) => {
		await assertOrganizationAndActor(transaction, organizationId, actorUserId);
		const existing = await transaction.list(organizationId);
		const plan = planEntitlementOverrideReplacement({
			...input,
			organizationId,
			actorUserId,
			reason,
			existing,
		});
		await validateDraftTargets(transaction, plan.successor);
		if (
			!(await transaction.setRevocationIfUnscheduled({
				organizationId,
				revision: plan.target.revision,
				revokedAt: plan.transitionAt,
			}))
		) {
			throw new CustomEntitlementOperatorError(
				"concurrent-write",
				`Revision ${plan.target.revision} changed without honoring the organization lock`,
			);
		}
		const successor = await transaction.insert(plan.successor);
		await transaction.reconcile(organizationId, input.now);
		return { endedRevision: plan.target.revision, successor, transitionAt: plan.transitionAt };
	});
}

export async function previewEntitlementOverrideRevocation(
	input: Omit<Parameters<typeof planEntitlementOverrideRevocation>[0], "existing" | "expectedLatestRevision">,
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<EntitlementOverrideRevocationPlan & { latestRevision: number }> {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const actorUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	return store.withOrganizationLock(organizationId, async (transaction) => {
		await assertOrganizationAndActor(transaction, organizationId, actorUserId);
		const existing = await transaction.list(organizationId);
		const latestRevision = latestEntitlementRevision(existing);
		return {
			...planEntitlementOverrideRevocation({
				...input,
				organizationId,
				actorUserId,
				reason,
				existing,
				expectedLatestRevision: latestRevision,
			}),
			latestRevision,
		};
	});
}

export async function revokeEntitlementOverride(
	input: Omit<Parameters<typeof planEntitlementOverrideRevocation>[0], "existing">,
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<{
	action: "cancel" | "revoke";
	revokedRevision: number;
	restoredPredecessorRevision: number | null;
	auditRevision: EntitlementOverrideRevision;
}> {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const actorUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	return store.withOrganizationLock(organizationId, async (transaction) => {
		await assertOrganizationAndActor(transaction, organizationId, actorUserId);
		const existing = await transaction.list(organizationId);
		const plan = planEntitlementOverrideRevocation({ ...input, organizationId, actorUserId, reason, existing });
		if (
			!(await transaction.setRevocationIfUnscheduled({
				organizationId,
				revision: input.revision,
				revokedAt: input.now,
			}))
		) {
			throw new CustomEntitlementOperatorError(
				"concurrent-write",
				`Revision ${input.revision} changed without honoring the organization lock`,
			);
		}
		if (
			plan.restorePredecessor &&
			!(await transaction.rescheduleRevocationIfMatches({
				organizationId,
				revision: plan.restorePredecessor.revision,
				expectedRevokedAt: plan.restorePredecessor.expectedRevokedAt,
				revokedAt: plan.restorePredecessor.revokedAt,
			}))
		) {
			throw new CustomEntitlementOperatorError(
				"concurrent-write",
				`Predecessor revision ${plan.restorePredecessor.revision} changed without honoring the organization lock`,
			);
		}
		const auditRevision = await transaction.insert(plan.audit);
		await transaction.reconcile(organizationId, input.now);
		return {
			action: plan.action,
			revokedRevision: plan.target.revision,
			restoredPredecessorRevision: plan.restorePredecessor?.revision ?? null,
			auditRevision,
		};
	});
}

export async function listEntitlementOverrides(
	organizationId: string,
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<EntitlementOverrideRevision[]> {
	const normalizedOrganizationId = requiredText(organizationId, "Organization ID");
	return store.withOrganizationLock(normalizedOrganizationId, async (transaction) => {
		await assertOrganizationAndActor(transaction, normalizedOrganizationId);
		return transaction.list(normalizedOrganizationId);
	});
}

export async function readCurrentEntitlementOverride(
	organizationId: string,
	at: Date = new Date(),
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<EntitlementOverrideRevision | null> {
	validDate(at, "at");
	const revisions = await listEntitlementOverrides(organizationId, store);
	return currentEntitlementRevision(revisions, at);
}

function mapRevision(row: typeof organizationEntitlementOverrides.$inferSelect): EntitlementOverrideRevision {
	const payload = organizationEntitlementOverrideSchema.safeParse({
		version: row.schemaVersion,
		entitlements: row.entitlements,
	});
	if (!payload.success) {
		throw new CustomEntitlementOperatorError(
			"invalid-input",
			`Stored entitlement revision ${row.revision} for organization ${row.organizationId} is invalid`,
		);
	}
	if (!row.reason?.trim() || !row.createdByUserId) {
		throw new CustomEntitlementOperatorError(
			"invalid-input",
			`Stored entitlement revision ${row.revision} is missing required audit metadata`,
		);
	}
	return {
		id: row.id,
		organizationId: row.organizationId,
		revision: row.revision,
		payload: payload.data,
		effectiveFrom: row.effectiveFrom,
		effectiveUntil: row.effectiveUntil,
		revokedAt: row.revokedAt,
		reason: row.reason,
		createdByUserId: row.createdByUserId,
		createdAt: row.createdAt,
	};
}

function createTransactionStore(tx: DbTransaction): EntitlementOverrideTransactionStore {
	return {
		async organizationExists(organizationId) {
			const [found] = await tx
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.id, organizationId))
				.limit(1);
			return Boolean(found);
		},
		async organizationUsesCustomPlan(organizationId) {
			const [found] = await tx
				.select({ organizationId: organizationBillingSubscriptions.organizationId })
				.from(organizationBillingSubscriptions)
				.where(
					and(
						eq(organizationBillingSubscriptions.organizationId, organizationId),
						eq(organizationBillingSubscriptions.basePlanKey, "custom"),
					),
				)
				.limit(1);
			return Boolean(found);
		},
		async actorExists(actorUserId) {
			const [found] = await tx.select({ id: user.id }).from(user).where(eq(user.id, actorUserId)).limit(1);
			return Boolean(found);
		},
		async list(organizationId) {
			const rows = await tx
				.select()
				.from(organizationEntitlementOverrides)
				.where(eq(organizationEntitlementOverrides.organizationId, organizationId))
				.orderBy(asc(organizationEntitlementOverrides.revision));
			return rows.map(mapRevision);
		},
		async insert(draft) {
			const [inserted] = await tx
				.insert(organizationEntitlementOverrides)
				.values({
					organizationId: draft.organizationId,
					revision: draft.revision,
					schemaVersion: draft.payload.version,
					entitlements: draft.payload.entitlements,
					effectiveFrom: draft.effectiveFrom,
					effectiveUntil: draft.effectiveUntil,
					revokedAt: draft.revokedAt,
					reason: draft.reason,
					createdByUserId: draft.createdByUserId,
				})
				.returning();
			if (!inserted)
				throw new CustomEntitlementOperatorError("concurrent-write", "Entitlement revision was not inserted");
			return mapRevision(inserted);
		},
		async setRevocationIfUnscheduled(input) {
			const [updated] = await tx
				.update(organizationEntitlementOverrides)
				.set({ revokedAt: input.revokedAt })
				.where(
					and(
						eq(organizationEntitlementOverrides.organizationId, input.organizationId),
						eq(organizationEntitlementOverrides.revision, input.revision),
						isNull(organizationEntitlementOverrides.revokedAt),
						or(
							isNull(organizationEntitlementOverrides.effectiveUntil),
							gt(organizationEntitlementOverrides.effectiveUntil, input.revokedAt),
						),
					),
				)
				.returning({ revision: organizationEntitlementOverrides.revision });
			return Boolean(updated);
		},
		async rescheduleRevocationIfMatches(input) {
			const [updated] = await tx
				.update(organizationEntitlementOverrides)
				.set({ revokedAt: input.revokedAt })
				.where(
					and(
						eq(organizationEntitlementOverrides.organizationId, input.organizationId),
						eq(organizationEntitlementOverrides.revision, input.revision),
						eq(organizationEntitlementOverrides.revokedAt, input.expectedRevokedAt),
					),
				)
				.returning({ revision: organizationEntitlementOverrides.revision });
			return Boolean(updated);
		},
		async reconcile(organizationId, now) {
			await reconcileOrganizationTrackingEntitlementsInTransaction({ tx, organizationId, now });
		},
		async availableTrackingTargetKeys() {
			return new Set(parseScrapeTargets(process.env.SCRAPE_TARGETS).map(getTrackingTargetKey));
		},
	};
}

export function createEntitlementOverrideStore(): EntitlementOverrideStore {
	return {
		withOrganizationLock(organizationId, run) {
			return db.transaction(async (tx) => {
				// Share the capacity lock: a contract change cannot race a brand or
				// prompt count-and-write decision based on the old contract.
				await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`elmo-capacity:${organizationId}`}, 0))`);
				return run(createTransactionStore(tx));
			});
		},
	};
}
