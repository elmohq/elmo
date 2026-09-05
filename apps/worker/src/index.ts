import * as Sentry from "@sentry/node";
import { getDeployment } from "@workspace/deployment";
import { getProvider, parseScrapeTargets, validateScrapeTargets } from "@workspace/lib/providers";
import { RECONCILE_ROLLUPS_QUEUE, REFRESH_ROLLUPS_QUEUE, REPROCESS_QUEUE } from "@workspace/lib/rollups/constants";
import { startCredentialRefresh } from "@workspace/lib/secrets";
import boss from "./boss";
import { registerHandlers } from "./handlers";
import { initializePipeline } from "./rollups-startup";
import { shutdownTelemetry } from "./telemetry";

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || "development",
		tracesSampleRate: 1.0,
	});
}

async function main() {
	console.log("Starting pg-boss worker...");

	// Awaited so a stored credential counts toward the validation below.
	await startCredentialRefresh();

	// Fail fast on misconfigured SCRAPE_TARGETS — surfaces unknown providers,
	// missing API keys, and per-provider target errors before any job runs.
	validateScrapeTargets(parseScrapeTargets(process.env.SCRAPE_TARGETS), getProvider);
	console.log("SCRAPE_TARGETS validated");

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
	if (getDeployment().features.reportGeneration) {
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
	// Same options apps/web creates these with: whichever process starts first
	// defines the queue, and a send to a queue that does not exist fails.
	await boss.createQueue(REFRESH_ROLLUPS_QUEUE, {
		retryLimit: 2,
		retryDelay: 30,
		retryBackoff: true,
		expireInSeconds: 60 * 5,
	});
	await boss.createQueue(RECONCILE_ROLLUPS_QUEUE, {
		retryLimit: 1,
		retryDelay: 300,
		expireInSeconds: 60 * 30,
	});
	await boss.createQueue(REPROCESS_QUEUE, {
		retryLimit: 2,
		retryDelay: 60,
		retryBackoff: true,
		expireInSeconds: 60 * 10,
	});
	console.log("Queues created");

	await boss.schedule("schedule-maintenance", "*/5 * * * *", { source: "scheduled" }, { tz: "UTC" });
	console.log("Scheduled maintenance job (every 5 minutes)");

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.schedule("sync-auth0-memberships", "*/15 * * * *", { source: "scheduled" }, { tz: "UTC" });
		console.log("Scheduled Auth0 membership sync (every 15 minutes)");
	}

	await boss.schedule(
		REFRESH_ROLLUPS_QUEUE,
		"* * * * *",
		{ source: "scheduled" },
		{ tz: "UTC", singletonKey: REFRESH_ROLLUPS_QUEUE },
	);
	console.log("Scheduled refresh-rollups job (every minute)");

	await boss.schedule(RECONCILE_ROLLUPS_QUEUE, "0 3 * * *", { source: "scheduled" }, { tz: "UTC" });
	console.log("Scheduled reconcile-rollups job (daily at 03:00 UTC)");

	// Backfill/version bookkeeping, and the reprocess sends it can trigger, need
	// the queues above to already exist — hence after creation, before handlers
	// start pulling jobs off them.
	await initializePipeline();

	// Register job handlers
	await registerHandlers(boss);
	console.log("All handlers registered, worker is ready");
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
	await boss.stop({ graceful: true, timeout: 30000 });
	await Promise.all([Sentry.flush(2000), shutdownTelemetry()]);
	console.log("Worker stopped");
	process.exit(0);
});

process.on("SIGINT", async () => {
	console.log("Received SIGINT, shutting down gracefully...");
	await boss.stop({ graceful: true, timeout: 30000 });
	await Promise.all([Sentry.flush(2000), shutdownTelemetry()]);
	console.log("Worker stopped");
	process.exit(0);
});
