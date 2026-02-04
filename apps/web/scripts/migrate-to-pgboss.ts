#!/usr/bin/env tsx

/**
 * Migration script: Set up pg-boss schedules for all enabled prompts.
 * 
 * This script:
 * 1. Finds all enabled prompts
 * 2. Creates a schedule for each prompt based on brand cadence
 * 3. Optionally sends immediate jobs for prompts that are overdue
 * 
 * Run with:
 *   pnpm --filter=web exec tsx scripts/migrate-to-pgboss.ts
 * 
 * Options:
 *   --immediate    Also send immediate jobs for all prompts (not just overdue)
 *   --dry-run      Show what would happen without making changes
 */

import { PgBoss } from "pg-boss";
import { db } from "@workspace/lib/db/db";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { DEFAULT_DELAY_HOURS } from "@workspace/lib/constants";

const BATCH_SIZE = 50;

/**
 * Convert cadence hours to a cron expression.
 * pg-boss uses standard cron format: minute hour day-of-month month day-of-week
 */
function hoursToCron(hours: number): string {
	if (!Number.isFinite(hours) || hours <= 0) {
		throw new Error("Hours must be a positive number");
	}

	if (!Number.isInteger(hours)) {
		throw new Error("Hours must be an integer for cron scheduling");
	}

	if (hours < 24) {
		// For sub-daily intervals, run every N hours
		return `0 */${hours} * * *`;
	}

	// For >= 24 hours, convert to days (only exact multiples)
	if (hours % 24 !== 0) {
		throw new Error("Hours must be a multiple of 24 for daily cron scheduling");
	}

	const days = hours / 24;
	if (days === 1) {
		return "0 0 * * *"; // Daily at midnight
	}

	return `0 0 */${days} * *`; // Every N days at midnight
}

interface PromptInfo {
	promptId: string;
	brandId: string;
	brandName: string;
	cadenceHours: number;
	lastRunAt: Date | null;
	isOverdue: boolean;
}

async function getEnabledPromptInfo(): Promise<PromptInfo[]> {
	const enabledPrompts = await db
		.select({
			promptId: prompts.id,
			brandId: prompts.brandId,
		})
		.from(prompts)
		.where(eq(prompts.enabled, true));

	const brandsList = await db.select().from(brands).where(eq(brands.enabled, true));
	const brandMap = new Map(
		brandsList.map((brand) => [
			brand.id,
			{ name: brand.name, cadenceHours: brand.delayOverrideHours ?? DEFAULT_DELAY_HOURS },
		]),
	);

	// Get the most recent run per prompt per model group
	const lastRuns = await db
		.select({
			promptId: promptRuns.promptId,
			modelGroup: promptRuns.modelGroup,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId, promptRuns.modelGroup);

	// Group by promptId -> { modelGroup -> lastRunAt }
	const lastRunMap = new Map<string, Record<string, Date>>();
	for (const run of lastRuns) {
		if (!lastRunMap.has(run.promptId)) {
			lastRunMap.set(run.promptId, {});
		}
		lastRunMap.get(run.promptId)![run.modelGroup] = run.lastRunAt;
	}

	const now = Date.now();
	const modelGroups = ["openai", "anthropic", "google"] as const;

	// Filter to only include prompts from enabled brands
	return enabledPrompts
		.filter((prompt) => brandMap.has(prompt.brandId))
		.map((prompt) => {
			const brandInfo = brandMap.get(prompt.brandId)!;
			const promptRuns = lastRunMap.get(prompt.promptId) ?? {};
			const cadenceMs = brandInfo.cadenceHours * 60 * 60 * 1000;

			// Check if ANY model group is overdue (matches admin/workflows logic)
			let isOverdue = false;
			let oldestRecentRun: Date | null = null;

			for (const modelGroup of modelGroups) {
				const lastRunAt = promptRuns[modelGroup];
				if (lastRunAt) {
					const timeSinceRun = now - new Date(lastRunAt).getTime();
					if (timeSinceRun > cadenceMs) {
						isOverdue = true;
					}
					// Track the oldest "most recent" run for logging
					if (!oldestRecentRun || new Date(lastRunAt) < oldestRecentRun) {
						oldestRecentRun = new Date(lastRunAt);
					}
				} else {
					// Model group never run - consider overdue
					isOverdue = true;
				}
			}

			return {
				promptId: prompt.promptId,
				brandId: prompt.brandId,
				brandName: brandInfo.name,
				cadenceHours: brandInfo.cadenceHours,
				lastRunAt: oldestRecentRun,
				isOverdue,
			};
		});
}

async function migrate() {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const sendImmediate = args.includes("--immediate");

	console.log("🚀 Starting pg-boss schedule migration");
	if (dryRun) {
		console.log("   (DRY RUN - no changes will be made)");
	}
	if (sendImmediate) {
		console.log("   (Will send immediate jobs for ALL prompts)");
	}

	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required");
	}

	const boss = new PgBoss({
		connectionString,
		schema: "pgboss",
	});

	if (!dryRun) {
		await boss.start();
		console.log("📦 pg-boss connected");

		// Create the queue if it doesn't exist (required in pg-boss v12)
		await boss.createQueue("process-prompt", {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 15, // 15 minute timeout
		});
		console.log("📦 Queue 'process-prompt' created");
	}

	const promptInfos = await getEnabledPromptInfo();
	console.log(`📊 Found ${promptInfos.length} enabled prompts from enabled brands`);

	if (promptInfos.length === 0) {
		console.log("✅ No prompts to migrate.");
		if (!dryRun) {
			await boss.stop();
		}
		return;
	}

	// Group by cadence for summary
	const byCadence = new Map<number, number>();
	for (const info of promptInfos) {
		byCadence.set(info.cadenceHours, (byCadence.get(info.cadenceHours) || 0) + 1);
	}
	console.log("📊 Prompts by cadence:");
	for (const [hours, count] of byCadence) {
		console.log(`   • ${hours}h: ${count} prompts`);
	}

	const overdueCount = promptInfos.filter((p) => p.isOverdue).length;
	console.log(`📊 Overdue prompts: ${overdueCount}`);

	let schedulesCreated = 0;
	let immediateJobsSent = 0;
	let failures = 0;

	for (let i = 0; i < promptInfos.length; i += BATCH_SIZE) {
		const batch = promptInfos.slice(i, i + BATCH_SIZE);
		const batchNum = Math.floor(i / BATCH_SIZE) + 1;
		const totalBatches = Math.ceil(promptInfos.length / BATCH_SIZE);
		console.log(`📝 Processing batch ${batchNum}/${totalBatches}`);

		const results = await Promise.allSettled(
			batch.map(async (info) => {
				const cron = hoursToCron(info.cadenceHours);

				if (dryRun) {
					console.log(
						`   [DRY] Would create schedule for prompt ${info.promptId} (${cron})${info.isOverdue || sendImmediate ? " + immediate job" : ""}`,
					);
					return { scheduled: true, immediate: info.isOverdue || sendImmediate };
				}

				// Create the recurring schedule - use fixed job name with promptId as key
				await boss.schedule("process-prompt", cron, { promptId: info.promptId }, { tz: "UTC", key: info.promptId });

				// Send immediate job if overdue or requested
				let sentImmediate = false;
				if (info.isOverdue || sendImmediate) {
					await boss.send(
						"process-prompt",
						{ promptId: info.promptId },
						{
							singletonKey: `migration-${info.promptId}`,
							singletonSeconds: 60 * 60, // 1 hour
							retryLimit: 3,
							retryDelay: 60,
							retryBackoff: true,
							expireInSeconds: 60 * 15,
						},
					);
					sentImmediate = true;
				}

				return { scheduled: true, immediate: sentImmediate };
			}),
		);

		for (const result of results) {
			if (result.status === "fulfilled") {
				schedulesCreated++;
				if (result.value.immediate) {
					immediateJobsSent++;
				}
			} else {
				failures++;
				console.error(`❌ Failed: ${String(result.reason)}`);
			}
		}
	}

	if (!dryRun) {
		await boss.stop();
	}

	console.log("\n📈 Migration Summary:");
	console.log(`  • Total prompts: ${promptInfos.length}`);
	console.log(`  • Schedules created: ${schedulesCreated}`);
	console.log(`  • Immediate jobs sent: ${immediateJobsSent}`);
	console.log(`  • Failures: ${failures}`);

	if (failures > 0) {
		throw new Error(`Migration completed with ${failures} failures`);
	}
}

if (require.main === module) {
	migrate()
		.then(() => {
			console.log("✅ Migration completed");
			process.exit(0);
		})
		.catch((error) => {
			console.error("💥 Migration failed:", error);
			process.exit(1);
		});
}

export { migrate };
