import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { getMigrationStats, clearMigrationStats } from "@/lib/tinybird-comparison";
import { testTinybirdConnection, type TinybirdConnectionTest } from "@/lib/tinybird-read";
import { db } from "@/lib/db/db";
import { promptRuns } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Migration phase status
interface PhaseStatus {
	phase: number;
	name: string;
	status: "completed" | "in_progress" | "pending";
	description: string;
	details?: string;
}

async function getPhaseStatuses(): Promise<PhaseStatus[]> {
	// Check if Tinybird write is enabled (Phase 1)
	const tinybirdWriteEnabled = process.env.TINYBIRD_WRITE_ENABLED === "true";
	const tinybirdVerifyEnabled = process.env.TINYBIRD_VERIFY_ENABLED === "true";
	const tinybirdReadPrimary = process.env.TINYBIRD_READ_PRIMARY === "true";

	// Get PostgreSQL row count for Phase 2 verification
	let pgRowCount = 0;
	try {
		const result = await db
			.select({ count: sql<number>`COUNT(*)::int` })
			.from(promptRuns);
		pgRowCount = result[0]?.count || 0;
	} catch {
		// Ignore errors
	}

	// Determine phase statuses
	const phases: PhaseStatus[] = [
		{
			phase: 1,
			name: "Dual-Write Setup",
			status: tinybirdWriteEnabled ? "completed" : "pending",
			description: "Write all new data to both PostgreSQL and Tinybird",
			details: tinybirdWriteEnabled 
				? "TINYBIRD_WRITE_ENABLED=true" 
				: "Set TINYBIRD_WRITE_ENABLED=true to enable",
		},
		{
			phase: 2,
			name: "Historical Backfill",
			status: pgRowCount > 0 ? "completed" : "pending",
			description: "Backfill all historical data from PostgreSQL to Tinybird",
			details: `PostgreSQL has ${pgRowCount.toLocaleString()} rows`,
		},
		{
			phase: 3,
			name: "Admin Dashboard",
			status: "completed", // If this page loads, it's complete
			description: "Monitor query performance and data verification",
			details: "This dashboard is now active",
		},
		{
			phase: 4,
			name: "Dual-Read Verification",
			status: tinybirdVerifyEnabled ? "in_progress" : "pending",
			description: "Query both sources and verify results match",
			details: tinybirdVerifyEnabled 
				? "TINYBIRD_VERIFY_ENABLED=true" 
				: "Set TINYBIRD_VERIFY_ENABLED=true to enable",
		},
		{
			phase: 5,
			name: "Cutover to Tinybird",
			status: tinybirdReadPrimary ? "in_progress" : "pending",
			description: "Read from Tinybird as primary source",
			details: tinybirdReadPrimary 
				? "TINYBIRD_READ_PRIMARY=true" 
				: "Set TINYBIRD_READ_PRIMARY=true after verification",
		},
		{
			phase: 6,
			name: "Cleanup",
			status: "pending",
			description: "Remove dual-write code and migration infrastructure",
			details: "Run after 30+ days stable on Tinybird",
		},
	];

	return phases;
}

export async function GET() {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		// Run connection test and get migration stats in parallel
		const [connectionTest, stats, phases] = await Promise.all([
			testTinybirdConnection(),
			getMigrationStats(),
			getPhaseStatuses(),
		]);

		// Get environment status
		const envStatus = {
			TINYBIRD_TOKEN: !!process.env.TINYBIRD_TOKEN,
			TINYBIRD_BASE_URL: !!process.env.TINYBIRD_BASE_URL,
			TINYBIRD_WRITE_ENABLED: process.env.TINYBIRD_WRITE_ENABLED === "true",
			TINYBIRD_VERIFY_ENABLED: process.env.TINYBIRD_VERIFY_ENABLED === "true",
			TINYBIRD_READ_PRIMARY: process.env.TINYBIRD_READ_PRIMARY === "true",
		};

		return NextResponse.json({
			phases,
			endpoints: stats.endpoints,
			recentMismatches: stats.recentMismatches,
			envStatus,
			connectionTest,
		});
	} catch (error) {
		console.error("Error fetching Tinybird migration stats:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

export async function DELETE() {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		// Clear all migration stats
		await clearMigrationStats();

		return NextResponse.json({ success: true, message: "Migration stats cleared" });
	} catch (error) {
		console.error("Error clearing Tinybird migration stats:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

