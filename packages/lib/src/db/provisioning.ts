/**
 * User / org / membership provisioning.
 *
 * Single place where "create a new user with an org and admin membership"
 * happens for local mode. Demo deployments reuse a database populated by
 * running the stack in local mode first, so there is no separate demo
 * provisioning path — the public demo box is just a read-only view over
 * that already-bootstrapped data.
 *
 * The primitives (`upsertOrganization`, `ensureMembership`) live in
 * `auth-sync.ts`; this file composes them into the higher-level
 * provisioning flow.
 */
import { count } from "drizzle-orm";
import { ensureMembership, upsertOrganization } from "./auth-sync";
import { db } from "./db";
import { user } from "./schema";

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
 * Org ID is a generated UUID — no env-var-driven default.
 */
export async function provisionLocalOrg(input: {
	userId: string;
	workspaceName: string;
}): Promise<{ orgId: string; orgName: string }> {
	const orgId = crypto.randomUUID();
	const orgName = normalizeWorkspaceName(input.workspaceName);

	await upsertOrganization({ id: orgId, name: orgName });
	await ensureMembership(input.userId, orgId, "admin");

	return { orgId, orgName };
}

function normalizeWorkspaceName(raw: string | undefined): string {
	const trimmed = (raw ?? "").trim();
	return trimmed.length > 0 ? trimmed : "Workspace";
}
