/** Beside the schema to avoid type mismatches between packages' drizzle-orm resolutions. */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { account, member, organization, user } from "./schema";

type AuthSyncTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The Auth0 sync runs on sign-in and on a schedule, so two runs for one user
 * could both insert. The member unique index is the backstop.
 */
async function lockUserMemberships(tx: AuthSyncTransaction, userId: string): Promise<void> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext('elmo-user-memberships'), hashtext(${userId}))`);
}

export async function ensureMembership(userId: string, orgId: string, role = "member"): Promise<void> {
	await db.transaction(async (tx) => {
		await lockUserMemberships(tx, userId);
		const existing = await tx
			.select({ id: member.id })
			.from(member)
			.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
			.limit(1);

		if (existing.length > 0) return;

		await tx
			.insert(member)
			.values({
				id: crypto.randomUUID(),
				organizationId: orgId,
				userId,
				role,
				createdAt: new Date(),
			})
			.onConflictDoNothing();
	});
}

export interface SyncMembershipsResult {
	added: string[];
	removed: string[];
	invalid: string[];
}

/** Never creates orgs: an unknown id is reported as invalid, or the FK would abort the whole reconciliation. */
export async function syncMemberships(userId: string, orgIds: string[]): Promise<SyncMembershipsResult> {
	const added: string[] = [];
	const removed: string[] = [];
	const invalid: string[] = [];

	await db.transaction(async (tx) => {
		await lockUserMemberships(tx, userId);
		const existing = await tx
			.select({ id: member.id, organizationId: member.organizationId })
			.from(member)
			.where(eq(member.userId, userId));
		const known = await tx.select({ id: organization.id }).from(organization).where(inArray(organization.id, orgIds));

		const existingOrgIds = new Set(existing.map((m) => m.organizationId));
		const knownOrgIds = new Set(known.map((o) => o.id));
		const targetOrgIds = new Set(orgIds.filter((id) => knownOrgIds.has(id)));
		invalid.push(...orgIds.filter((id) => !knownOrgIds.has(id)));

		for (const orgId of targetOrgIds) {
			if (!existingOrgIds.has(orgId)) {
				const inserted = await tx
					.insert(member)
					.values({
						id: crypto.randomUUID(),
						organizationId: orgId,
						userId,
						role: "member",
						createdAt: new Date(),
					})
					.onConflictDoNothing()
					.returning({ organizationId: member.organizationId });
				if (inserted.length > 0) added.push(orgId);
			}
		}

		const stale = existing.filter((m) => !targetOrgIds.has(m.organizationId));
		if (stale.length > 0) {
			await tx.delete(member).where(
				inArray(
					member.id,
					stale.map((m) => m.id),
				),
			);
			removed.push(...stale.map((m) => m.organizationId));
		}
	});

	return { added, removed, invalid };
}

export async function listAuth0Accounts(): Promise<{ userId: string; accountId: string }[]> {
	return db
		.select({ userId: account.userId, accountId: account.accountId })
		.from(account)
		.where(eq(account.providerId, "auth0-whitelabel"));
}

export async function updateUserFlags(
	userId: string,
	flags: { role?: string; hasReportGeneratorAccess?: boolean },
): Promise<void> {
	const updates: Record<string, unknown> = {};
	if (flags.role !== undefined) updates.role = flags.role;
	if (flags.hasReportGeneratorAccess !== undefined) {
		updates.hasReportGeneratorAccess = flags.hasReportGeneratorAccess;
	}

	if (Object.keys(updates).length > 0) {
		await db.update(user).set(updates).where(eq(user.id, userId));
	}
}

export async function findAccountByProvider(
	userId: string,
	providerMatch: (providerId: string) => boolean,
): Promise<{ accountId: string; providerId: string } | null> {
	const accounts = await db
		.select({ accountId: account.accountId, providerId: account.providerId })
		.from(account)
		.where(eq(account.userId, userId));

	const match = accounts.find((a) => providerMatch(a.providerId));
	return match ?? null;
}
