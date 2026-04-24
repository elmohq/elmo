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
 * Create the organization + admin membership for a freshly-created
 * local-mode user. Called from the better-auth `user.create.after`
 * database hook so the user always lands in exactly one org with admin
 * rights.
 *
 * Org ID is a generated UUID; the slug embeds the first 8 hex chars so
 * it's unique by construction without a lookup round-trip.
 */
export async function provisionLocalOrg(input: {
	userId: string;
	workspaceName: string;
}): Promise<{ orgId: string; orgName: string }> {
	const orgId = crypto.randomUUID();
	const orgName = normalizeWorkspaceName(input.workspaceName);
	const slug = buildSlug(orgName, orgId);

	await db.insert(organization).values({
		id: orgId,
		name: orgName,
		slug,
		createdAt: new Date(),
	});

	await db.insert(member).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		userId: input.userId,
		role: "admin",
		createdAt: new Date(),
	});

	return { orgId, orgName };
}

function normalizeWorkspaceName(raw: string | undefined): string {
	const trimmed = (raw ?? "").trim();
	return trimmed.length > 0 ? trimmed : "Workspace";
}

function buildSlug(name: string, orgId: string): string {
	const base = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	const prefix = base.length > 0 ? base : "workspace";
	return `${prefix}-${orgId.slice(0, 8)}`;
}
