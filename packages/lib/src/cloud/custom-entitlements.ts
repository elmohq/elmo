import {
	type OrganizationEntitlementOverride as EntitlementPayload,
	organizationEntitlementOverrideSchema,
} from "@workspace/config/plans";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/db";
import { organization, organizationBillingSubscriptions, organizationEntitlementOverrides, user } from "../db/schema";

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
	revokeIfActive(input: { organizationId: string; revision: number; now: Date }): Promise<boolean>;
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

export function effectiveWindowsOverlap(
	left: { effectiveFrom: Date; effectiveUntil: Date | null },
	right: { effectiveFrom: Date; effectiveUntil: Date | null },
): boolean {
	const leftStartsBeforeRightEnds = right.effectiveUntil === null || left.effectiveFrom < right.effectiveUntil;
	const rightStartsBeforeLeftEnds = left.effectiveUntil === null || right.effectiveFrom < left.effectiveUntil;
	return leftStartsBeforeRightEnds && rightStartsBeforeLeftEnds;
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
			.filter(
				(revision) =>
					revision.revokedAt === null &&
					revision.effectiveFrom <= at &&
					(revision.effectiveUntil === null || revision.effectiveUntil > at),
			)
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
	const overlap = input.existing.find(
		(revision) => revision.revokedAt === null && effectiveWindowsOverlap(revision, requestedWindow),
	);
	if (overlap) {
		throw new CustomEntitlementOperatorError(
			"effective-window-overlap",
			`The requested effective window overlaps non-revoked revision ${overlap.revision}`,
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

export function planEntitlementOverrideRevocation(input: {
	organizationId: string;
	actorUserId: string;
	reason: string;
	revision: number;
	now: Date;
	expectedLatestRevision: number;
	existing: EntitlementOverrideRevision[];
}): { target: EntitlementOverrideRevision; audit: EntitlementOverrideDraft } {
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
	if (
		!target ||
		target.revokedAt !== null ||
		target.effectiveFrom > now ||
		(target.effectiveUntil !== null && target.effectiveUntil <= now)
	) {
		throw new CustomEntitlementOperatorError(
			"revision-not-active",
			`Revision ${input.revision} is not active at ${now.toISOString()}`,
		);
	}

	return {
		target,
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
			reason: `Revoked revision ${target.revision}: ${reason}`,
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
		return {
			draft: planEntitlementOverrideAppend({
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
		return transaction.insert(draft);
	});
}

export async function previewEntitlementOverrideRevocation(
	input: Omit<Parameters<typeof planEntitlementOverrideRevocation>[0], "existing" | "expectedLatestRevision">,
	store: EntitlementOverrideStore = createEntitlementOverrideStore(),
): Promise<{ target: EntitlementOverrideRevision; audit: EntitlementOverrideDraft; latestRevision: number }> {
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
): Promise<{ revokedRevision: number; auditRevision: EntitlementOverrideRevision }> {
	const organizationId = requiredText(input.organizationId, "Organization ID");
	const actorUserId = requiredText(input.actorUserId, "Actor user ID");
	const reason = requiredText(input.reason, "Reason");
	return store.withOrganizationLock(organizationId, async (transaction) => {
		await assertOrganizationAndActor(transaction, organizationId, actorUserId);
		const existing = await transaction.list(organizationId);
		const plan = planEntitlementOverrideRevocation({ ...input, organizationId, actorUserId, reason, existing });
		if (!(await transaction.revokeIfActive({ organizationId, revision: input.revision, now: input.now }))) {
			throw new CustomEntitlementOperatorError(
				"concurrent-write",
				`Revision ${input.revision} changed without honoring the organization lock`,
			);
		}
		const auditRevision = await transaction.insert(plan.audit);
		return { revokedRevision: plan.target.revision, auditRevision };
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
		async revokeIfActive(input) {
			const [updated] = await tx
				.update(organizationEntitlementOverrides)
				.set({ revokedAt: input.now })
				.where(
					and(
						eq(organizationEntitlementOverrides.organizationId, input.organizationId),
						eq(organizationEntitlementOverrides.revision, input.revision),
						isNull(organizationEntitlementOverrides.revokedAt),
						lte(organizationEntitlementOverrides.effectiveFrom, input.now),
						or(
							isNull(organizationEntitlementOverrides.effectiveUntil),
							gt(organizationEntitlementOverrides.effectiveUntil, input.now),
						),
					),
				)
				.returning({ revision: organizationEntitlementOverrides.revision });
			return Boolean(updated);
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
