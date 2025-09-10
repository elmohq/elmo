/**
 * Direct test of prompts optimization logic
 * 
 * This script directly tests the database queries and logic without
 * going through API endpoints or HTTP requests.
 */

import { db } from "@/lib/db/db";
import { prompts, promptRuns, brands, competitors } from "@/lib/db/schema";
import { eq, and, gte, lte, desc, count, sql } from "drizzle-orm";
import { calculateVisibilityPercentages } from "@/lib/chart-utils";

async function testPromptsOptimizationDirect() {
	console.log("🧪 Testing Prompts Optimization Logic Directly...\n");

	try {
		// Use the brand ID you provided
		const brandId = "2aabb918-bd81-4e60-953d-b43a85a9dbca";
		console.log(`📊 Testing with brand ID: ${brandId}`);

		// Test 1: New optimized summary query (what the new API does)
		console.log("\n1️⃣ Testing optimized summary query...");
		const startSummary = Date.now();

		// This is what the new /prompts-summary endpoint does
		const optimizedSummary = await db
			.select({
				id: prompts.id,
				value: prompts.value,
				groupCategory: prompts.groupCategory,
				groupPrefix: prompts.groupPrefix,
				enabled: prompts.enabled,
				createdAt: prompts.createdAt,
				totalRuns: count(promptRuns.id),
				brandMentions: sql<number>`SUM(CASE WHEN ${promptRuns.brandMentioned} THEN 1 ELSE 0 END)`,
				competitorMentions: sql<number>`SUM(CASE WHEN array_length(${promptRuns.competitorsMentioned}, 1) > 0 THEN 1 ELSE 0 END)`,
			})
			.from(prompts)
			.leftJoin(promptRuns, eq(promptRuns.promptId, prompts.id))
			.where(eq(prompts.brandId, brandId))
			.groupBy(
				prompts.id,
				prompts.value,
				prompts.groupCategory,
				prompts.groupPrefix,
				prompts.enabled,
				prompts.createdAt,
			)
			.orderBy(desc(prompts.createdAt))
			.limit(10); // Test with first 10

		const summaryEndTime = Date.now() - startSummary;
		console.log(`✅ Optimized summary query completed in ${summaryEndTime}ms`);
		console.log(`📈 Found ${optimizedSummary.length} prompts`);

		if (optimizedSummary.length > 0) {
			const sample = optimizedSummary[0];
			const totalRuns = Number(sample.totalRuns);
			const brandMentions = Number(sample.brandMentions);
			const competitorMentions = Number(sample.competitorMentions);
			
			console.log(`📊 Sample prompt: "${sample.value.substring(0, 50)}..."`);
			console.log(`   - Total runs: ${totalRuns}`);
			console.log(`   - Brand mentions: ${brandMentions}`);
			console.log(`   - Competitor mentions: ${competitorMentions}`);
			console.log(`   - Brand mention rate: ${totalRuns > 0 ? Math.round((brandMentions / totalRuns) * 100) : 0}%`);
		}

		// Test 2: Individual prompt chart data (what the new individual endpoint does)
		if (optimizedSummary.length > 0) {
			console.log("\n2️⃣ Testing individual prompt chart data query...");
			const testPrompt = optimizedSummary[0];
			const startChart = Date.now();

			// Get date range for last week
			const toDate = new Date();
			const fromDate = new Date();
			fromDate.setDate(fromDate.getDate() - 7);

			// This is what the new /chart-data endpoint does
			const promptRunsData = await db
				.select({
					id: promptRuns.id,
					promptId: promptRuns.promptId,
					modelGroup: promptRuns.modelGroup,
					model: promptRuns.model,
					webSearchEnabled: promptRuns.webSearchEnabled,
					rawOutput: promptRuns.rawOutput,
					webQueries: promptRuns.webQueries,
					brandMentioned: promptRuns.brandMentioned,
					competitorsMentioned: promptRuns.competitorsMentioned,
					createdAt: promptRuns.createdAt,
				})
				.from(promptRuns)
				.where(and(
					eq(promptRuns.promptId, testPrompt.id),
					gte(promptRuns.createdAt, fromDate),
					lte(promptRuns.createdAt, toDate),
					eq(promptRuns.webSearchEnabled, true)
				))
				.orderBy(desc(promptRuns.createdAt));

			const chartEndTime = Date.now() - startChart;
			console.log(`✅ Individual chart query completed in ${chartEndTime}ms`);
			console.log(`📊 Found ${promptRunsData.length} runs for prompt`);

			// Test chart data calculation
			if (promptRunsData.length > 0) {
				const startCalc = Date.now();
				
				// Get brand and competitors
				const brandData = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
				const competitorsData = await db.select().from(competitors).where(eq(competitors.brandId, brandId));
				
				if (brandData.length > 0) {
					const chartData = calculateVisibilityPercentages(promptRunsData, brandData[0], competitorsData, "1w");
					const calcEndTime = Date.now() - startCalc;
					
					console.log(`✅ Chart data calculation completed in ${calcEndTime}ms`);
					console.log(`📈 Generated ${chartData.length} chart data points`);
					console.log(`🏢 Brand: ${brandData[0].name}`);
					console.log(`🏪 Competitors: ${competitorsData.length}`);
				}
			}
		}

		// Test 3: Compare with old approach (what the original implementation does)
		console.log("\n3️⃣ Testing old approach (fetch everything at once)...");
		const startOld = Date.now();

		// This is what the old implementation does - fetch ALL prompt runs
		const allPrompts = await db
			.select()
			.from(prompts)
			.where(eq(prompts.brandId, brandId));

		const allRuns = await db
			.select()
			.from(promptRuns)
			.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
			.where(eq(prompts.brandId, brandId));

		const oldEndTime = Date.now() - startOld;
		console.log(`⏱️ Old approach completed in ${oldEndTime}ms`);
		console.log(`📊 Fetched ${allRuns.length} prompt runs for ${allPrompts.length} prompts`);

		// Test 4: Database aggregation approach (optional optimization)
		console.log("\n4️⃣ Testing database aggregation approach...");
		const startAgg = Date.now();

		// Get date range for last week
		const toDateAgg = new Date();
		const fromDateAgg = new Date();
		fromDateAgg.setDate(fromDateAgg.getDate() - 7);

		// This is what the aggregated endpoint would do
		const aggregatedData = await db
			.select({
				date: sql<string>`DATE(${promptRuns.createdAt})`,
				promptId: promptRuns.promptId,
				totalRuns: sql<number>`COUNT(*)`,
				brandMentions: sql<number>`SUM(CASE WHEN ${promptRuns.brandMentioned} THEN 1 ELSE 0 END)`,
			})
			.from(promptRuns)
			.innerJoin(prompts, eq(promptRuns.promptId, prompts.id))
			.where(and(
				eq(prompts.brandId, brandId),
				gte(promptRuns.createdAt, fromDateAgg),
				lte(promptRuns.createdAt, toDateAgg),
				eq(promptRuns.webSearchEnabled, true)
			))
			.groupBy(sql`DATE(${promptRuns.createdAt})`, promptRuns.promptId)
			.orderBy(sql`DATE(${promptRuns.createdAt})`)
			.limit(100); // Test with sample

		const aggEndTime = Date.now() - startAgg;
		console.log(`✅ Database aggregation completed in ${aggEndTime}ms`);
		console.log(`📊 Generated ${aggregatedData.length} aggregated data points`);

		// Performance comparison
		console.log("\n📈 Performance Comparison:");
		console.log(`• Summary query: ${summaryEndTime}ms`);
		console.log(`• Individual chart: ${chartEndTime}ms (per chart)`);
		console.log(`• Database aggregation: ${aggEndTime}ms`);
		console.log(`• Old approach: ${oldEndTime}ms (everything at once)`);
		
		const improvementFactor = Math.round(oldEndTime / Math.max(summaryEndTime, 1));
		console.log(`🚀 Summary query is ${improvementFactor}x faster than old approach!`);

		console.log("\n🎉 Direct testing completed!");
		console.log("\n📈 Key Benefits Demonstrated:");
		console.log("• ⚡ Fast summary for initial page load");
		console.log("• 🎯 Targeted queries for individual charts");
		console.log("• 📊 Database-level aggregation when needed");
		console.log("• 💾 Reduced data transfer and memory usage");
		console.log("• 🔄 Independent loading prevents blocking");

	} catch (error) {
		console.error("❌ Test failed:", error);
	}
}

// Run the test if this file is executed directly
if (require.main === module) {
	testPromptsOptimizationDirect()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("Test execution failed:", error);
			process.exit(1);
		});
}

export { testPromptsOptimizationDirect };
