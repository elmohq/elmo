/**
 * User / org / membership provisioning.
 *
 * Single place where "create a new user with an org and admin membership"
 * happens for local mode. Demo deployments reuse a database populated by
 * running the stack in local mode first, so there is no separate demo
 * provisioning path — the public demo box is just a read-only view over
 * that already-bootstrapped data.
 *
 * Everything here is one-shot: the better-auth `user.create.before` hook
 * rejects any signup when a user already exists, so these inserts only
 * ever run once against a given database. The SQL is plain INSERTs (no
 * upsert, no existence checks) to make that intent obvious — a second
 * call is a bug and should fail at the database layer rather than
 * silently rewriting rows.
 */
import { count } from "drizzle-orm";
import { db } from "./db";
import { member, organization, user } from "./schema";

/**
 * Number of users in the database.
 *
 * Used by the local-mode signup guard — "allow the first signup, reject
 * every subsequent one". Kept as its own small function so the hook
 * doesn't import drizzle directly.
 */
export async function countUsers(): Promise<number> {
	const [row] = await db.select({ count: count() }).from(user);
	return row?.count ?? 0;
}

/**
 * The single organization created in local mode.
 *
 * Hardcoded because local mode has exactly one org per install, the user
 * never sees or interacts with this identity (they pick a brand in the
 * onboarding wizard, which is what the UI actually surfaces), and a
 * stable id makes URLs like `/app/default` predictable.
 */
const LOCAL_ORG = {
	id: "default",
	name: "Default",
	slug: "default",
} as const;

/**
 * Create the organization + admin membership for a freshly-created
 * local-mode user. Called from the better-auth `user.create.after`
 * database hook so the user always lands in exactly one org with admin
 * rights.
 */
export async function provisionLocalOrg(input: { userId: string }): Promise<{ orgId: string }> {
	await db.insert(organization).values({
		id: LOCAL_ORG.id,
		name: LOCAL_ORG.name,
		slug: LOCAL_ORG.slug,
		createdAt: new Date(),
	});

	await db.insert(member).values({
		id: crypto.randomUUID(),
		organizationId: LOCAL_ORG.id,
		userId: input.userId,
		role: "admin",
		createdAt: new Date(),
	});

	return { orgId: LOCAL_ORG.id };
}
