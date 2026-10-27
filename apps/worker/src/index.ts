import "./instrument";
import * as Sentry from "@sentry/node";
import { assertRequiredEnv } from "@workspace/config/env";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { getDeploymentFeatures } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { getProvider, validateScrapeTargets } from "@workspace/lib/providers";
import { REFRESH_ROLLUPS_QUEUE, ROLLUP_CATCH_UP_QUEUE } from "@workspace/lib/rollups/constants";
import { startCredentialRefresh } from "@workspace/lib/secrets";
import { startBackfills } from "./backfills";
import { getBoss } from "./boss";
import { registerHandlers } from "./handlers";
import { DERIVE_RUNS_QUEUE, DERIVE_RUNS_QUEUE_OPTIONS, reprocessDays, requestUnjudgedRuns } from "./jobs/derive-runs";
import {
	adoptCurrentStamps,
	REPROCESS_QUEUE,
	REQUEST_REPROCESSES_QUEUE,
	requestStaleReprocesses,
} from "./jobs/reprocess";
import { configureMentionAnalyzer, mentionAnalyzer } from "./mention-judge/analyze";
import { initializePipeline } from "./rollups-startup";
import { shutdownTelemetry } from "./telemetry";

async function main() {
	console.log("Starting pg-boss worker...");
	assertRequiredEnv();
	const boss = getBoss();

	// Awaited so a stored credential counts toward the validation below.
	await startCredentialRefresh();

	// Fail fast on misconfigured SCRAPE_TARGETS — surfaces unknown providers,
	// missing API keys, and per-provider target errors before any job runs.
	validateScrapeTargets(parseScrapeTargets(process.env.SCRAPE_TARGETS), getProvider);
	console.log("SCRAPE_TARGETS validated");
	reprocessDays();

	// Before anything stamps runs or brands: the stamp names the judge.
	const { judgeVersion } = configureMentionAnalyzer();
	console.log(`Judging mentions with ${judgeVersion}`);

	boss.on("error", (error) => {
		console.error("pg-boss error:", error);
		Sentry.withScope((scope) => {
			scope.setTag("source", "pg-boss-internal");
			Sentry.captureException(error);
		});
	});

	// Start pg-boss (creates schema if needed)
	await boss.start();
	console.log("pg-boss started");

	// Create queues if they don't exist (required in pg-boss v12)
	await boss.createQueue("process-prompt", {
		retryLimit: 3,
		retryDelay: 60,
		retryBackoff: true,
		expireInSeconds: 60 * 15, // 15 minute timeout
	});
	if (getDeploymentFeatures().reportGeneration) {
		await boss.createQueue("generate-report", {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 60, // 1 hour timeout for reports
		});
	}
	await boss.createQueue("analyze-brand", {
		retryLimit: 1,
		retryDelay: 10,
		retryBackoff: false,
		expireInSeconds: 60 * 15, // 15 minute timeout for onboarding brand analysis
	});
	await boss.createQueue("suggest-prompts", {
		retryLimit: 1,
		retryDelay: 10,
		retryBackoff: false,
		expireInSeconds: 60 * 15,
	});
	await boss.createQueue("schedule-maintenance", {
		retryLimit: 3,
		retryDelay: 300, // 5 minutes between retries
		retryBackoff: true,
		expireInSeconds: 60 * 30, // 30 minute timeout
	});
	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.createQueue("sync-auth0-memberships", {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 10,
		});
	}
	await boss.createQueue(REFRESH_ROLLUPS_QUEUE, {
		retryLimit: 2,
		retryDelay: 30,
		retryBackoff: true,
		expireInSeconds: 60 * 5,
	});
	await boss.createQueue(ROLLUP_CATCH_UP_QUEUE, {
		retryLimit: 5,
		retryDelay: 60,
		retryBackoff: true,
		// A full mark scans all of prompt_runs once.
		expireInSeconds: 60 * 60,
	});
	await boss.createQueue(DERIVE_RUNS_QUEUE, DERIVE_RUNS_QUEUE_OPTIONS);
	await boss.createQueue(REPROCESS_QUEUE, {
		policy: "stately",
		retryLimit: 2,
		retryDelay: 60,
		retryBackoff: true,
		expireInSeconds: 60 * 10,
	});
	await boss.createQueue(REQUEST_REPROCESSES_QUEUE, {
		retryLimit: 0,
		expireInSeconds: 60 * 2,
	});
	console.log("Queues created");

	await boss.schedule("schedule-maintenance", "*/5 * * * *", { source: "scheduled" }, { tz: "UTC" });
	console.log("Scheduled maintenance job (every 5 minutes)");

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.schedule("sync-auth0-memberships", "*/15 * * * *", { source: "scheduled" }, { tz: "UTC" });
		console.log("Scheduled Auth0 membership sync (every 15 minutes)");
	}

	// Before any handler runs, so the stale pass never mistakes a brand that
	// predates stamping for one whose whole history needs replaying.
	const adopted = await adoptCurrentStamps();
	if (adopted > 0) console.log(`Adopted current analysis stamps for ${adopted} brands`);

	await boss.schedule(
		REQUEST_REPROCESSES_QUEUE,
		"* * * * *",
		{},
		{ tz: "UTC", singletonKey: REQUEST_REPROCESSES_QUEUE },
	);
	console.log("Scheduled request-reprocesses job (every minute)");

	await boss.schedule(
		REFRESH_ROLLUPS_QUEUE,
		"* * * * *",
		{ source: "scheduled" },
		{ tz: "UTC", singletonKey: REFRESH_ROLLUPS_QUEUE },
	);
	console.log("Scheduled refresh-rollups job (every minute)");

	await initializePipeline(boss);

	// Register job handlers
	await registerHandlers(boss);
	console.log("All handlers registered, worker is ready");

	await requestUnjudgedRuns(db, boss, { days: 30, limit: 50_000 }).then(
		(unjudged) => unjudged > 0 && console.log(`Asked again to judge ${unjudged} runs`),
		(error) => Sentry.captureException(error),
	);
	await requestStaleReprocesses(db, boss, mentionAnalyzer(), { everyBrand: true }).catch((error) =>
		Sentry.captureException(error),
	);

	await startBackfills();
}

main().catch(async (error) => {
	Sentry.captureException(error);
	console.error("Failed to start worker:", error);
	await Sentry.flush(2000);
	process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
	console.log("Received SIGTERM, shutting down gracefully...");
	await getBoss().stop({ graceful: true, timeout: 30000 });
	await Promise.all([Sentry.flush(2000), shutdownTelemetry()]);
	console.log("Worker stopped");
	process.exit(0);
});

process.on("SIGINT", async () => {
	console.log("Received SIGINT, shutting down gracefully...");
	await getBoss().stop({ graceful: true, timeout: 30000 });
	await Promise.all([Sentry.flush(2000), shutdownTelemetry()]);
	console.log("Worker stopped");
	process.exit(0);
});
