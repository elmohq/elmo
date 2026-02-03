#!/usr/bin/env tsx

import { db } from "@workspace/lib/db/db";
import { brands, promptRuns, prompts } from "@workspace/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { DBOSClient } from "@dbos-inc/dbos-sdk";
import { promptsQueue } from "@workspace/lib/dbos";
import { DEFAULT_DELAY_HOURS } from "@workspace/lib/constants";

const WORKFLOW_NAME = "processPrompt";
const BATCH_SIZE = 25;

type PromptDelayInfo = {
	promptId: string;
	brandId: string;
	delayHours: number;
	lastRunAt: Date | null;
};

async function getEnabledPromptInfo(): Promise<PromptDelayInfo[]> {
	const enabledPrompts = await db
		.select({
			promptId: prompts.id,
			brandId: prompts.brandId,
		})
		.from(prompts)
		.where(eq(prompts.enabled, true));

	const brandsList = await db.select().from(brands);
	const brandDelayMap = new Map(
		brandsList.map((brand) => [brand.id, brand.delayOverrideHours ?? DEFAULT_DELAY_HOURS]),
	);

	const lastRuns = await db
		.select({
			promptId: promptRuns.promptId,
			lastRunAt: sql<Date>`MAX(${promptRuns.createdAt})`.as("last_run_at"),
		})
		.from(promptRuns)
		.groupBy(promptRuns.promptId);

	const lastRunMap = new Map(lastRuns.map((run) => [run.promptId, run.lastRunAt]));

	return enabledPrompts.map((prompt) => ({
		promptId: prompt.promptId,
		brandId: prompt.brandId,
		delayHours: brandDelayMap.get(prompt.brandId) ?? DEFAULT_DELAY_HOURS,
		lastRunAt: lastRunMap.get(prompt.promptId) ?? null,
		nextRunAtFromBullmq: null,
	}));
}

function computeInitialDelayHours(info: PromptDelayInfo, now: number): number {
	if (!info.lastRunAt) {
		return 0;
	}

	const nextRunAt = info.lastRunAt.getTime() + info.delayHours * 60 * 60 * 1000;
	if (nextRunAt <= now) {
		return 0;
	}

	return (nextRunAt - now) / (60 * 60 * 1000);
}

async function migrate() {
	console.log("🚀 Starting BullMQ → DBOS migration");

	const dbosClient = await DBOSClient.create({
		systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL,
	});

	const promptInfos = await getEnabledPromptInfo();
	console.log(`📊 Found ${promptInfos.length} enabled prompts`);

	if (promptInfos.length === 0) {
		console.log("✅ No prompts to migrate.");
		return;
	}

	const now = Date.now();
	let started = 0;
	let failures = 0;
	let maxDelayHours = 0;

	for (let i = 0; i < promptInfos.length; i += BATCH_SIZE) {
		const batch = promptInfos.slice(i, i + BATCH_SIZE);
		console.log(`📝 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(promptInfos.length / BATCH_SIZE)}`);

		const results = await Promise.allSettled(
			batch.map(async (info) => {
				const initialDelayHours = computeInitialDelayHours(info, now);
				if (initialDelayHours > maxDelayHours) {
					maxDelayHours = initialDelayHours;
				}

				const workflowId = `prompt-${info.promptId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
				await dbosClient.startWorkflow(
					{
						workflowName: WORKFLOW_NAME,
						queueName: promptsQueue.name,
						workflowID: workflowId,
					},
					info.promptId,
					initialDelayHours,
				);

				return { promptId: info.promptId, initialDelayHours };
			}),
		);

		results.forEach((result) => {
			if (result.status === "fulfilled") {
				started += 1;
			} else {
				failures += 1;
				console.error(`❌ Failed to start workflow: ${String(result.reason)}`);
			}
		});
	}

	console.log("\n📈 Migration Summary:");
	console.log(`  • Total prompts processed: ${promptInfos.length}`);
	console.log(`  • Workflows started: ${started}`);
	console.log(`  • Failures: ${failures}`);

	const safeDate = new Date(now + maxDelayHours * 60 * 60 * 1000);
	console.log(`\nSafe to remove initialDelayHours after: ${safeDate.toISOString()}`);
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
