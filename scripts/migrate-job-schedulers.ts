#!/usr/bin/env tsx

/**
 * Migration script to create job schedulers for existing enabled prompts
 * 
 * This script should be run once after deploying the job scheduler functionality
 * to ensure all existing enabled prompts have their repeatable jobs set up.
 * 
 * Usage: tsx scripts/migrate-job-schedulers.ts
 */

import { db } from "../src/lib/db/db";
import { prompts } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { createMultiplePromptJobSchedulers } from "../src/lib/job-scheduler";

async function migrateJobSchedulers() {
	console.log("🚀 Starting job scheduler migration...");
	
	try {
		// Get all enabled prompts
		const enabledPrompts = await db
			.select({ id: prompts.id, value: prompts.value, brandId: prompts.brandId })
			.from(prompts)
			.where(eq(prompts.enabled, true));

		console.log(`📊 Found ${enabledPrompts.length} enabled prompts`);

		if (enabledPrompts.length === 0) {
			console.log("✅ No enabled prompts found. Migration complete.");
			return;
		}

		// Extract prompt IDs
		const promptIds = enabledPrompts.map(p => p.id);

		// Create job schedulers in batches of 10 to avoid overwhelming the system
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
					console.log(`  ✅ Created job scheduler for prompt ${promptId}`);
				} else {
					failureCount++;
					console.log(`  ❌ Failed to create job scheduler for prompt ${promptId}`);
				}
			});

			// Add a small delay between batches to be gentle on the system
			if (i + batchSize < promptIds.length) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}

		console.log("\n📈 Migration Summary:");
		console.log(`  • Total prompts processed: ${enabledPrompts.length}`);
		console.log(`  • Job schedulers created: ${successCount}`);
		console.log(`  • Failures: ${failureCount}`);

		if (failureCount > 0) {
			console.log("\n⚠️  Some job schedulers failed to create. Check the logs above for details.");
			console.log("   You may want to re-run this script or manually create the missing schedulers.");
		} else {
			console.log("\n🎉 All job schedulers created successfully!");
		}

	} catch (error) {
		console.error("💥 Migration failed:", error);
		process.exit(1);
	}
}

// Run the migration if this script is executed directly
if (require.main === module) {
	migrateJobSchedulers()
		.then(() => {
			console.log("✅ Migration completed");
			process.exit(0);
		})
		.catch((error) => {
			console.error("💥 Migration failed:", error);
			process.exit(1);
		});
}

export { migrateJobSchedulers }; 