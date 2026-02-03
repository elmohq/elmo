import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { db } from "@workspace/lib/db/db";
import { brands, prompts } from "@workspace/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { getAdminRunsOverTime, getAdminBrandRunStats, getAdminActiveBrandsOverTime } from "@/lib/tinybird-read-v2";

export const dynamic = "force-dynamic";

interface BrandStats {
	id: string;
	name: string;
	website: string;
	enabled: boolean;
	onboarded: boolean;
	delayOverrideMs: number | null;
	createdAt: Date;
	updatedAt: Date;
	totalPrompts: number;
	activePrompts: number;
	promptRuns7Days: number;
	promptRuns30Days: number;
	lastPromptRunAt: Date | null;
	promptsAddedLast7Days: number;
	promptsRemovedLast7Days: number;
	promptsAddedLast30Days: number;
	promptsRemovedLast30Days: number;
}

export async function GET() {
	try {
		// Check if user is admin
		const adminStatus = await isAdmin();
		if (!adminStatus) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
		}

		// Fetch data in parallel for better performance
		const [
			allBrands,
			brandsOverTime,
			promptsOverTime,
			tinybirdRunsOverTime,
			tinybirdBrandStats,
			tinybirdActiveBrandsOverTime,
		] = await Promise.all([
			// Get all brands ordered by creation date (newest first)
			db.query.brands.findMany({
				orderBy: desc(brands.createdAt),
			}),

			// Get cumulative brand count over time (last 30 days)
			db
				.select({
					date: sql<string>`date_series::date`,
					count: sql<number>`COUNT(${brands.id})::int`,
				})
				.from(sql`generate_series(
					NOW()::date - INTERVAL '30 days',
					NOW()::date,
					INTERVAL '1 day'
				) AS date_series`)
				.leftJoin(
					brands,
					sql`${brands.createdAt}::date <= date_series::date`
				)
				.groupBy(sql`date_series`)
				.orderBy(sql`date_series`),

			// Get cumulative prompts count over time (last 30 days) - enabled vs disabled
			db
				.select({
					date: sql<string>`date_series::date`,
					enabled: sql<number>`COUNT(*) FILTER (WHERE ${prompts.enabled} = true)::int`,
					disabled: sql<number>`COUNT(*) FILTER (WHERE ${prompts.enabled} = false)::int`,
				})
				.from(sql`generate_series(
					NOW()::date - INTERVAL '30 days',
					NOW()::date,
					INTERVAL '1 day'
				) AS date_series`)
				.leftJoin(
					prompts,
					sql`${prompts.createdAt}::date <= date_series::date`
				)
				.groupBy(sql`date_series`)
				.orderBy(sql`date_series`),

			// Get runs over time from Tinybird (fast!)
			getAdminRunsOverTime(),

			// Get per-brand run stats from Tinybird (fast!)
			getAdminBrandRunStats(),

			// Get active brands over time from Tinybird (rolling 7-day window)
			getAdminActiveBrandsOverTime(),
		]);

		// Create a map of brand_id -> run stats for quick lookup
		const brandRunStatsMap = new Map(
			tinybirdBrandStats.map((stat) => [stat.brand_id, stat])
		);

		// Get stats for each brand - now only needs prompt counts from PostgreSQL
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

		const brandStats: BrandStats[] = await Promise.all(
			allBrands.map(async (brand) => {
				// Count total and active prompts (still from PostgreSQL - it's the source of truth for prompts)
				const promptCounts = await db
					.select({
						total: sql<number>`count(*)::int`,
						active: sql<number>`count(*) filter (where enabled = true)::int`,
					})
					.from(prompts)
					.where(eq(prompts.brandId, brand.id));

				// Count prompts added and removed in last 7 and 30 days
				const recentPromptCounts = await db
					.select({
						added7Days: sql<number>`count(*) filter (where ${prompts.createdAt} >= ${sevenDaysAgo})::int`,
						removed7Days: sql<number>`count(*) filter (where ${prompts.updatedAt} >= ${sevenDaysAgo} and ${prompts.enabled} = false)::int`,
						added30Days: sql<number>`count(*) filter (where ${prompts.createdAt} >= ${thirtyDaysAgo})::int`,
						removed30Days: sql<number>`count(*) filter (where ${prompts.updatedAt} >= ${thirtyDaysAgo} and ${prompts.enabled} = false)::int`,
					})
					.from(prompts)
					.where(eq(prompts.brandId, brand.id));

				// Get run stats from Tinybird (pre-fetched)
				const runStats = brandRunStatsMap.get(brand.id);

				return {
					...brand,
					totalPrompts: promptCounts[0]?.total || 0,
					activePrompts: promptCounts[0]?.active || 0,
					promptRuns7Days: runStats?.runs_7d || 0,
					promptRuns30Days: runStats?.runs_30d || 0,
					lastPromptRunAt: runStats?.last_run_at ? new Date(runStats.last_run_at) : null,
					promptsAddedLast7Days: recentPromptCounts[0]?.added7Days || 0,
					promptsRemovedLast7Days: recentPromptCounts[0]?.removed7Days || 0,
					promptsAddedLast30Days: recentPromptCounts[0]?.added30Days || 0,
					promptsRemovedLast30Days: recentPromptCounts[0]?.removed30Days || 0,
				};
			}),
		);

		// Transform Tinybird runs over time to match expected format
		const runsOverTime = tinybirdRunsOverTime.map((row) => ({
			date: row.date,
			count: row.count,
		}));

		// Transform Tinybird active brands over time to match expected format
		const activeBrandsOverTime = tinybirdActiveBrandsOverTime.map((row) => ({
			date: row.date,
			count: row.count,
		}));

		return NextResponse.json({ 
			brands: brandStats,
			brandsOverTime,
			activeBrandsOverTime,
			promptsOverTime,
			runsOverTime,
		});
	} catch (error) {
		console.error("Error fetching brand statistics:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}
