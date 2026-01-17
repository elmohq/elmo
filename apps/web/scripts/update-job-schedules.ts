#!/usr/bin/env tsx

/**
 * Script to update job schedules for all enabled prompts
 * 
 * This script updates the cadence of existing job schedulers from 1 day to 3 days
 * by calling createPromptJobScheduler for all enabled prompts. Since the function
 * uses upsertJobScheduler, it will update existing schedulers with the new timing.
 * 
 * Usage: tsx scripts/update-job-schedules.ts
 */

import { db } from "../src/lib/db/db";
import { prompts } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { createMultiplePromptJobSchedulers } from "../src/lib/job-scheduler";

async function updateJobSchedules() {
	console.log("🔄 Starting job schedule update...");
	console.log("📅 Updating cadence from 1 day to 3 days for all enabled prompts");
	
	try {
		// Get all enabled prompts
		const enabledPrompts = await db
			.select({ id: prompts.id, value: prompts.value, brandId: prompts.brandId })
			.from(prompts)
			.where(eq(prompts.enabled, true));

		console.log(`📊 Found ${enabledPrompts.length} enabled prompts`);

		if (enabledPrompts.length === 0) {
			console.log("✅ No enabled prompts found. Update complete.");
			return;
		}

		// Extract prompt IDs
		const promptIds = enabledPrompts.map(p => p.id);

		// Update job schedulers in batches of 10 to avoid overwhelming the system
		const batchSize = 10;
		let successCount = 0;
		let failureCount = 0;

		for (let i = 0; i < promptIds.length; i += batchSize) {
			const batch = promptIds.slice(i, i + batchSize);
			console.log(`📝 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(promptIds.length / batchSize)} (${batch.length} prompts)`);

			const results = await createMultiplePromptJobSchedulers(batch);
			
			results.forEach((success, index) => {
				const promptId = batch[index];
				if (success) {
					successCount++;
					console.log(`  ✅ Updated job schedule for prompt ${promptId}`);
				} else {
					failureCount++;
					console.log(`  ❌ Failed to update job schedule for prompt ${promptId}`);
				}
			});


			// Add a small delay between batches to be gentle on the system
			if (i + batchSize < promptIds.length) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		console.log("\n📈 Update Summary:");
		console.log(`  • Total prompts processed: ${enabledPrompts.length}`);
		console.log(`  • Job schedules updated: ${successCount}`);
		console.log(`  • Creation failures: ${failureCount}`);
		console.log(`  • New cadence: Every 3 days`);

		if (failureCount > 0) {
			console.log("\n⚠️  Issues detected:");
			console.log(`   • ${failureCount} job schedules failed to create`);
			console.log("   Check the logs above for details. You may want to re-run this script.");
		} else {
			console.log("\n🎉 All job schedules updated successfully!");
		}

	} catch (error) {
		console.error("💥 Update failed:", error);
		process.exit(1);
	}
}

// Run the update if this script is executed directly
if (require.main === module) {
	updateJobSchedules()
		.then(() => {
			console.log("✅ Job schedule update completed");
			process.exit(0);
		})
		.catch((error) => {
			console.error("💥 Job schedule update failed:", error);
			process.exit(1);
		});
}

export { updateJobSchedules };
