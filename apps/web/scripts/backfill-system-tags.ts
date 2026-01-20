#!/usr/bin/env tsx

/**
 * Backfill script to update all existing prompts with branded/unbranded system tags
 * 
 * This script analyzes each prompt's value against its brand name and website
 * to determine if it should be tagged as "branded" or "unbranded".
 * 
 * Usage: tsx scripts/backfill-system-tags.ts
 * 
 * Options:
 *   --dry-run    Preview changes without actually updating the database
 */

import { db } from "@workspace/lib/db/db";
import { prompts, brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { computeSystemTags } from "@workspace/lib/tag-utils";

interface PromptWithBrand {
	id: string;
	value: string;
	brandId: string;
	systemTags: string[];
	brandName: string;
	brandWebsite: string;
}

async function backfillSystemTags() {
	const isDryRun = process.argv.includes("--dry-run");
	
	console.log("🚀 Starting system tags backfill...");
	if (isDryRun) {
		console.log("🔍 DRY RUN MODE - No changes will be made to the database\n");
	}
	
	try {
		// Get all prompts with their brand info
		const allPrompts = await db
			.select({
				id: prompts.id,
				value: prompts.value,
				brandId: prompts.brandId,
				systemTags: prompts.systemTags,
			})
			.from(prompts);

		console.log(`📊 Found ${allPrompts.length} total prompts`);

		// Get all brands
		const allBrands = await db
			.select({
				id: brands.id,
				name: brands.name,
				website: brands.website,
			})
			.from(brands);

		console.log(`📊 Found ${allBrands.length} brands\n`);

		// Create a map of brand IDs to brand info
		const brandMap = new Map(allBrands.map(b => [b.id, b]));

		// Process prompts
		let updatedCount = 0;
		let skippedCount = 0;
		let errorCount = 0;
		let brandedCount = 0;
		let unbrandedCount = 0;

		const updates: { id: string; value: string; oldTags: string[]; newTags: string[] }[] = [];

		for (const prompt of allPrompts) {
			const brand = brandMap.get(prompt.brandId);
			
			if (!brand) {
				console.warn(`⚠️  Prompt ${prompt.id} has unknown brand ${prompt.brandId}, skipping`);
				errorCount++;
				continue;
			}

			// Compute what the system tags should be
			const computedTags = computeSystemTags(prompt.value, brand.name, brand.website);
			const currentTags = prompt.systemTags || [];

			// Check if tags need updating
			const tagsMatch = 
				computedTags.length === currentTags.length &&
				computedTags.every(tag => currentTags.includes(tag));

			if (tagsMatch) {
				skippedCount++;
				if (computedTags.includes("branded")) brandedCount++;
				else unbrandedCount++;
				continue;
			}

			updates.push({
				id: prompt.id,
				value: prompt.value,
				oldTags: currentTags,
				newTags: computedTags,
			});

			if (computedTags.includes("branded")) brandedCount++;
			else unbrandedCount++;
		}

		console.log(`\n📝 Changes to make: ${updates.length}`);
		console.log(`⏭️  Already correct: ${skippedCount}`);
		console.log(`❌ Errors: ${errorCount}\n`);

		// Show sample of changes
		if (updates.length > 0) {
			console.log("Sample changes (first 10):");
			console.log("─".repeat(80));
			for (const update of updates.slice(0, 10)) {
				const oldStr = update.oldTags.length > 0 ? update.oldTags.join(", ") : "(none)";
				const newStr = update.newTags.join(", ");
				console.log(`  "${update.value.substring(0, 50)}${update.value.length > 50 ? '...' : ''}"`);
				console.log(`    ${oldStr} → ${newStr}`);
			}
			if (updates.length > 10) {
				console.log(`  ... and ${updates.length - 10} more`);
			}
			console.log("─".repeat(80));
		}

		// Apply updates if not dry run
		if (!isDryRun && updates.length > 0) {
			console.log("\n🔄 Applying updates...");
			
			// Process in batches
			const batchSize = 50;
			for (let i = 0; i < updates.length; i += batchSize) {
				const batch = updates.slice(i, i + batchSize);
				
				await Promise.all(
					batch.map(update =>
						db
							.update(prompts)
							.set({ systemTags: update.newTags })
							.where(eq(prompts.id, update.id))
					)
				);
				
				updatedCount += batch.length;
				console.log(`  ✅ Updated ${updatedCount}/${updates.length} prompts`);
			}
		}

		// Summary
		console.log("\n" + "═".repeat(50));
		console.log("📊 SUMMARY");
		console.log("═".repeat(50));
		console.log(`Total prompts:     ${allPrompts.length}`);
		console.log(`Branded prompts:   ${brandedCount}`);
		console.log(`Unbranded prompts: ${unbrandedCount}`);
		console.log(`Updated:           ${isDryRun ? `${updates.length} (dry run)` : updatedCount}`);
		console.log(`Already correct:   ${skippedCount}`);
		console.log(`Errors:            ${errorCount}`);
		console.log("═".repeat(50));

		if (isDryRun && updates.length > 0) {
			console.log("\n💡 Run without --dry-run to apply these changes");
		}

		console.log("\n✅ Backfill complete!");
		
	} catch (error) {
		console.error("\n❌ Error during backfill:", error);
		process.exit(1);
	}
}

// Run the migration
backfillSystemTags()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});

