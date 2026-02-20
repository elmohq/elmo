/**
 * Seed better-auth tables for demo deployment mode.
 *
 * Creates a demo user (demo@elmohq.com / demo) with an organization
 * and membership so the app is ready to use out of the box. Idempotent.
 *
 * Uses the better-auth server API for proper password hashing -- the
 * auth instance is created inline since this runs as a standalone script
 * (before the web app starts).
 *
 * Local mode does NOT need seeding: users register their own accounts.
 *
 * Usage:
 *   DATABASE_URL=... DEPLOYMENT_MODE=demo DEFAULT_ORG_ID=xxx DEFAULT_ORG_NAME=yyy \
 *     npx tsx packages/lib/src/db/seed-auth.ts
 */
import { db } from "./db";
import { user, organization, member } from "./schema";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth/server";

const DEMO_USER = {
	email: "demo@elmohq.com",
	password: "demo",
	name: "Demo User",
};

async function seedDemoUser(auth: ReturnType<typeof createAuth>) {
	const existing = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, DEMO_USER.email))
		.limit(1);

	if (existing.length > 0) {
		console.log(`[seed-auth] Demo user already exists (${DEMO_USER.email})`);
		return existing[0].id;
	}

	const result = await auth.api.signUpEmail({
		body: {
			email: DEMO_USER.email,
			password: DEMO_USER.password,
			name: DEMO_USER.name,
		},
	});

	if (!result.user) {
		throw new Error("Failed to create demo user");
	}

	// Mark as admin with report access (demo shows everything read-only)
	await db.update(user).set({
		role: "admin",
		hasReportGeneratorAccess: true,
	}).where(eq(user.id, result.user.id));

	console.log(`[seed-auth] Created demo user: ${DEMO_USER.email} (id=${result.user.id})`);
	return result.user.id;
}

async function ensureOrg(orgId: string, orgName: string) {
	const existing = await db
		.select({ id: organization.id })
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);

	if (existing.length > 0) {
		await db.update(organization).set({ name: orgName }).where(eq(organization.id, orgId));
		return;
	}

	const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	await db.insert(organization).values({
		id: orgId,
		name: orgName,
		slug,
		createdAt: new Date(),
	});
}

async function ensureMembership(userId: string, orgId: string) {
	const existing = await db
		.select({ id: member.id })
		.from(member)
		.where(eq(member.userId, userId))
		.limit(1);

	if (existing.length > 0) return;

	await db.insert(member).values({
		id: crypto.randomUUID(),
		organizationId: orgId,
		userId,
		role: "admin",
		createdAt: new Date(),
	});
}

export async function seedAuth(mode: string): Promise<void> {
	if (mode !== "demo") {
		console.log(`[seed-auth] No seeding needed for "${mode}" mode (users self-register)`);
		return;
	}

	const orgId = process.env.DEFAULT_ORG_ID || "demo-org";
	const orgName = process.env.DEFAULT_ORG_NAME || "Demo Organization";

	console.log(`[seed-auth] Seeding demo data...`);
	const auth = createAuth();
	const userId = await seedDemoUser(auth);
	await ensureOrg(orgId, orgName);
	await ensureMembership(userId, orgId);
	console.log(`[seed-auth] Done (user=${DEMO_USER.email}, org=${orgId})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const mode = process.env.DEPLOYMENT_MODE || "demo";
	seedAuth(mode)
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("[seed-auth] Failed:", err);
			process.exit(1);
		});
}
