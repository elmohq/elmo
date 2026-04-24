/**
 * Seed better-auth tables for demo deployment mode.
 *
 * Creates the baked-in demo user (demo@elmohq.com / demo) plus organization
 * and admin membership via the shared provisioning module, so the app is
 * ready to use out of the box. Idempotent.
 *
 * Local mode does NOT need seeding: the first UI signup provisions the
 * user's org automatically.
 *
 * Usage:
 *   DATABASE_URL=... DEPLOYMENT_MODE=demo npx tsx packages/lib/src/db/seed-auth.ts
 */
import { provisionDemoUser } from "./provisioning";

const DEMO_USER = {
	email: "demo@elmohq.com",
	password: "demo",
	name: "Demo User",
	orgId: "demo-org",
	orgName: "Demo Organization",
};

export async function seedAuth(mode: string): Promise<void> {
	if (mode !== "demo") {
		console.log(`[seed-auth] No seeding needed for "${mode}" mode (users self-register)`);
		return;
	}

	console.log(`[seed-auth] Seeding demo data...`);
	const { userId, orgId } = await provisionDemoUser({
		...DEMO_USER,
		isAdmin: true,
		hasReportAccess: true,
	});
	console.log(`[seed-auth] Done (user=${DEMO_USER.email} id=${userId}, org=${orgId})`);
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
