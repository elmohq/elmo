/**
 * Seed better-auth tables for demo deployment mode.
 *
 * Creates one or more demo users plus their orgs and admin memberships
 * via the shared provisioning module, so the app is ready to use out of
 * the box. Idempotent.
 *
 * Local mode does NOT need seeding: the first UI signup provisions the
 * user's org automatically.
 *
 * By default seeds the single public demo user (demo@elmohq.com / demo).
 * To seed more users, point DEMO_SEED_FILE at a JSON array with the same
 * shape — handy for the hosted demo where additional accounts are managed
 * out-of-band.
 *
 * Usage:
 *   DATABASE_URL=... DEPLOYMENT_MODE=demo \
 *     npx tsx packages/lib/src/db/seed-auth.ts
 *
 *   # With custom users:
 *   DEMO_SEED_FILE=./demo-users.json npx tsx packages/lib/src/db/seed-auth.ts
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { provisionDemoUser } from "./provisioning";

const DemoUserSchema = z.object({
	email: z.string().email(),
	password: z.string().min(4),
	name: z.string().min(1),
	orgId: z.string().min(1),
	orgName: z.string().min(1),
	isAdmin: z.boolean().optional(),
	hasReportAccess: z.boolean().optional(),
});

const DemoSeedFileSchema = z.array(DemoUserSchema).min(1);

type DemoUser = z.infer<typeof DemoUserSchema>;

const DEFAULT_DEMO_USERS: DemoUser[] = [
	{
		email: "demo@elmohq.com",
		password: "demo",
		name: "Demo User",
		orgId: "demo-org",
		orgName: "Demo Organization",
		isAdmin: true,
		hasReportAccess: true,
	},
];

function loadDemoUsers(): DemoUser[] {
	const path = process.env.DEMO_SEED_FILE;
	if (!path) return DEFAULT_DEMO_USERS;

	const raw = readFileSync(path, "utf8");
	const parsed = DemoSeedFileSchema.parse(JSON.parse(raw));
	console.log(`[seed-auth] Loaded ${parsed.length} demo user(s) from ${path}`);
	return parsed;
}

export async function seedAuth(mode: string): Promise<void> {
	if (mode !== "demo") {
		console.log(`[seed-auth] No seeding needed for "${mode}" mode (users self-register)`);
		return;
	}

	const users = loadDemoUsers();
	console.log(`[seed-auth] Seeding ${users.length} demo user(s)...`);

	for (const user of users) {
		const { userId, orgId } = await provisionDemoUser(user);
		console.log(`[seed-auth]  - ${user.email} (id=${userId}) → ${user.orgName} (${orgId})`);
	}

	console.log(`[seed-auth] Done`);
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
