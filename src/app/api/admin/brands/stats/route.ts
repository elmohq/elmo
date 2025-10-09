import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/metadata";
import { db } from "@/lib/db/db";
import { brands, prompts, promptRuns } from "@/lib/db/schema";
import { eq, sql, gte, desc } from "drizzle-orm";

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

		// Get all brands ordered by creation date (newest first)
		const allBrands = await db.query.brands.findMany({
			orderBy: desc(brands.createdAt),
		});

		// Get cumulative brand count over time (last 30 days)
		const brandsOverTime = await db
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
			.orderBy(sql`date_series`);

		// Get cumulative prompts count over time (last 30 days) - enabled vs disabled
		const promptsOverTime = await db
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
			.orderBy(sql`date_series`);

		// Get historical data for prompt runs (last 30 days)
		const runsOverTime = await db
			.select({
				date: sql<string>`DATE(${promptRuns.createdAt})`,
				count: sql<number>`COUNT(*)::int`,
			})
			.from(promptRuns)
			.where(gte(promptRuns.createdAt, sql`NOW() - INTERVAL '30 days'`))
			.groupBy(sql`DATE(${promptRuns.createdAt})`)
			.orderBy(sql`DATE(${promptRuns.createdAt})`);

		// Get stats for each brand efficiently using raw SQL queries
		const brandStats: BrandStats[] = await Promise.all(
			allBrands.map(async (brand) => {
				// Count total and active prompts
				const promptCounts = await db
					.select({
						total: sql<number>`count(*)::int`,
						active: sql<number>`count(*) filter (where enabled = true)::int`,
					})
					.from(prompts)
					.where(eq(prompts.brandId, brand.id));

				// Count prompt runs in last 7 and 30 days
				const sevenDaysAgo = new Date();
				sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
				const thirtyDaysAgo = new Date();
				thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

				const runCounts = await db
					.select({
						runs7Days: sql<number>`count(*) filter (where ${promptRuns.createdAt} >= ${sevenDaysAgo})::int`,
						runs30Days: sql<number>`count(*) filter (where ${promptRuns.createdAt} >= ${thirtyDaysAgo})::int`,
					})
					.from(promptRuns)
					.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
					.where(eq(prompts.brandId, brand.id));

				// Get last prompt run date
				const lastRun = await db
					.select({
						createdAt: promptRuns.createdAt,
					})
					.from(promptRuns)
					.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
					.where(eq(prompts.brandId, brand.id))
					.orderBy(desc(promptRuns.createdAt))
					.limit(1);

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

				return {
					...brand,
					totalPrompts: promptCounts[0]?.total || 0,
					activePrompts: promptCounts[0]?.active || 0,
					promptRuns7Days: runCounts[0]?.runs7Days || 0,
					promptRuns30Days: runCounts[0]?.runs30Days || 0,
					lastPromptRunAt: lastRun[0]?.createdAt || null,
					promptsAddedLast7Days: recentPromptCounts[0]?.added7Days || 0,
					promptsRemovedLast7Days: recentPromptCounts[0]?.removed7Days || 0,
					promptsAddedLast30Days: recentPromptCounts[0]?.added30Days || 0,
					promptsRemovedLast30Days: recentPromptCounts[0]?.removed30Days || 0,
				};
			}),
		);

		return NextResponse.json({ 
			brands: brandStats,
			brandsOverTime,
			promptsOverTime,
			runsOverTime,
		});
	} catch (error) {
		console.error("Error fetching brand statistics:", error);
		return NextResponse.json({ error: "Internal server error" }, { status: 500 });
	}
}

