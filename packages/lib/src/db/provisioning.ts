/**
 * User / org / membership provisioning.
 *
 * Single place where "create a new user with an org and admin membership"
 * happens. Called by the local-mode signup hook (one user, one org) and
 * by the demo seed script (N users, N orgs). Any future bootstrap path
 * should go through here rather than writing to the `organization` /
 * `member` tables directly.
 *
 * The primitives (`upsertOrganization`, `ensureMembership`) live in
 * `auth-sync.ts`; this file composes them into the higher-level
 * provisioning flows.
 */
import { count, eq } from "drizzle-orm";
import { createAuth } from "../auth/server";
import { ensureMembership, updateUserFlags, upsertOrganization } from "./auth-sync";
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

/**
 * Idempotently create a demo user + org + admin membership.
 *
 * Used by the demo seed script; safe to re-run. Uses better-auth's
 * `signUpEmail` API so the password is hashed correctly. Applies
 * optional admin / report-access flags after the user is created.
 *
 * The `minPasswordLength: 4` override matches the demo deployment's own
 * auth config — demo seed passwords are intentionally short ("demo").
 */
export async function provisionDemoUser(input: {
	email: string;
	password: string;
	name: string;
	orgId: string;
	orgName: string;
	isAdmin?: boolean;
	hasReportAccess?: boolean;
}): Promise<{ userId: string; orgId: string }> {
	const userId = await findOrCreateUser(input);

	await updateUserFlags(userId, {
		...(input.isAdmin ? { role: "admin" } : {}),
		...(input.hasReportAccess ? { hasReportGeneratorAccess: true } : {}),
	});

	await upsertOrganization({ id: input.orgId, name: input.orgName });
	await ensureMembership(userId, input.orgId, input.isAdmin ? "admin" : "member");

	return { userId, orgId: input.orgId };
}

async function findOrCreateUser(input: { email: string; password: string; name: string }): Promise<string> {
	const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, input.email)).limit(1);
	if (existing.length > 0) return existing[0].id;

	const auth = createAuth({ minPasswordLength: 4 });
	const result = await auth.api.signUpEmail({
		body: {
			email: input.email,
			password: input.password,
			name: input.name,
		},
	});
	if (!result.user) {
		throw new Error(`Failed to create user ${input.email}`);
	}
	return result.user.id;
}
