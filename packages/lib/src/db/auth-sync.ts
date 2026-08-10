/**
 * Auth data sync helpers.
 *
 * High-level CRUD operations on better-auth tables (organization, member, user, account).
 * These are called by deployment-specific hooks (e.g. whitelabel Auth0 sync)
 * to keep auth state consistent with external identity providers.
 *
 * All drizzle operations are co-located here with the schema to avoid
 * cross-package type mismatches from different drizzle-orm resolutions.
 */
import { db } from "./db";
import { eq, and, ne, inArray, sql } from "drizzle-orm";
import { organization, member, user, account } from "./schema";

type AuthSyncTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serialize a single user's membership reconciliation. The whitelabel Auth0
 * sync runs both on sign-in and on a 15-minute worker schedule, so two runs
 * for the same user can otherwise interleave: both read "membership absent"
 * and both insert. A per-user transaction-scoped advisory lock makes the
 * read-modify-write atomic; the unique index added in migration 0014 is the
 * backstop if a write ever races the lock anyway. Keyed per user, so distinct
 * users never contend.
 */
async function lockUserMemberships(tx: AuthSyncTransaction, userId: string): Promise<void> {
	await tx.execute(sql`select pg_advisory_xact_lock(hashtext('elmo-user-memberships'), hashtext(${userId}))`);
}

async function uniqueSlug(baseSlug: string, excludeOrgId: string): Promise<string> {
	let candidate = baseSlug;
	let suffix = 2;
	for (;;) {
		const conflict = await db
			.select({ id: organization.id })
			.from(organization)
			.where(and(eq(organization.slug, candidate), ne(organization.id, excludeOrgId)))
			.limit(1);
		if (conflict.length === 0) return candidate;
		candidate = `${baseSlug}-${suffix}`;
		suffix++;
	}
}

export async function upsertOrganization(org: { id: string; name: string; slug?: string }): Promise<void> {
	const baseSlug =
		org.slug ??
		org.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	const slug = await uniqueSlug(baseSlug, org.id);

	await db
		.insert(organization)
		.values({
			id: org.id,
			name: org.name,
			slug,
			createdAt: new Date(),
		})
		.onConflictDoUpdate({
			target: organization.id,
			set: { name: org.name, slug },
		});
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
}

/**
 * Reconciles a user's org memberships to match the given set of org IDs.
 * Adds missing memberships and removes stale ones in a single transaction.
 */
export async function syncMemberships(userId: string, orgIds: string[]): Promise<SyncMembershipsResult> {
	const added: string[] = [];
	const removed: string[] = [];

	await db.transaction(async (tx) => {
		await lockUserMemberships(tx, userId);
		const existing = await tx
			.select({ id: member.id, organizationId: member.organizationId })
			.from(member)
			.where(eq(member.userId, userId));

		const existingOrgIds = new Set(existing.map((m) => m.organizationId));
		const targetOrgIds = new Set(orgIds);

		for (const orgId of orgIds) {
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

	return { added, removed };
}

/**
 * Returns all users that have an Auth0 SSO account linked.
 */
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
