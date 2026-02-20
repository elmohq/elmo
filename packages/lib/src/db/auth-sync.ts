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
import { eq, and, ne } from "drizzle-orm";
import { organization, member, user, account } from "./schema";

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

export async function upsertOrganization(org: {
	id: string;
	name: string;
	slug?: string;
}): Promise<void> {
	const baseSlug = org.slug ?? org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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

export async function ensureMembership(
	userId: string,
	orgId: string,
	role = "member",
): Promise<void> {
	const existing = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
		.limit(1);

	if (existing.length > 0) return;

	await db.insert(member).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		userId,
		role,
		createdAt: new Date(),
	});
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
