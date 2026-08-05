import fs from "node:fs/promises";
import * as Sentry from "@sentry/node";
import { validateCloudTrackingTargets } from "@workspace/cloud";
import { CLOUD_BILLING_RECONCILIATION_QUEUE } from "@workspace/cloud/billing-control";
import { parseProviderCostEstimates, validateProviderCostEstimateCoverage } from "@workspace/config/provider-costs";
import { getDeployment } from "@workspace/deployment";
import { CLOUD_BRAND_ANALYSIS_QUEUE } from "@workspace/lib/cloud/brand-analysis-admission";
import { CLOUD_TRACKING_DISPATCH_QUEUE, CLOUD_TRACKING_TASK_QUEUE } from "@workspace/lib/cloud/tracking-policy";
import { getProvider, parseScrapeTargets, validateScrapeTargets } from "@workspace/lib/providers";
import { startCredentialRefresh } from "@workspace/lib/secrets";
import boss from "./boss";
import { registerHandlers } from "./handlers";
import { CLOUD_PROVIDER_SPEND_REPORT_QUEUE, CLOUD_PROVIDER_SPEND_REPORT_SCHEDULE } from "./jobs/provider-spend-report";
import { validateWorkerStartupEnv } from "./startup-env";
import { shutdownTelemetry } from "./telemetry";

const WORKER_READY_FILE = "/tmp/elmo-worker-ready";

validateWorkerStartupEnv();
if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || "development",
		tracesSampleRate: 1.0,
	});
}

async function main() {
	await fs.rm(WORKER_READY_FILE, { force: true });
	console.log("Starting pg-boss worker...");

	// Awaited so a stored credential counts toward the validation below.
	await startCredentialRefresh();

	// Fail fast on misconfigured SCRAPE_TARGETS — surfaces unknown providers,
	// missing API keys, and per-provider target errors before any job runs.
	const scrapeTargets = parseScrapeTargets(process.env.SCRAPE_TARGETS);
	validateScrapeTargets(scrapeTargets, getProvider);
	if (process.env.DEPLOYMENT_MODE === "cloud") {
		validateCloudTrackingTargets(scrapeTargets);
		const costEstimates = parseProviderCostEstimates(process.env.CLOUD_TRACKING_COST_ESTIMATES);
		validateProviderCostEstimateCoverage(costEstimates, scrapeTargets);
	}
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
	await boss.createQueue(process.env.DEPLOYMENT_MODE === "cloud" ? CLOUD_BRAND_ANALYSIS_QUEUE : "analyze-brand", {
		retryLimit: process.env.DEPLOYMENT_MODE === "cloud" ? 0 : 1,
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
	if (process.env.DEPLOYMENT_MODE === "cloud") {
		await boss.createQueue(CLOUD_BILLING_RECONCILIATION_QUEUE, {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 5,
		});
		await boss.createQueue(CLOUD_TRACKING_DISPATCH_QUEUE, {
			retryLimit: 3,
			retryDelay: 30,
			retryBackoff: true,
			expireInSeconds: 60 * 5,
		});
		await boss.createQueue(CLOUD_TRACKING_TASK_QUEUE, {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 15,
		});
		await boss.createQueue(CLOUD_PROVIDER_SPEND_REPORT_QUEUE, {
			retryLimit: 3,
			retryDelay: 5 * 60,
			retryBackoff: true,
			expireInSeconds: 60 * 10,
		});
	}
	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.createQueue("sync-auth0-memberships", {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 10,
		});
	}
	console.log("Queues created");

	await boss.schedule("schedule-maintenance", "*/5 * * * *", { source: "scheduled" }, { tz: "UTC" });
	console.log("Scheduled maintenance job (every 5 minutes)");
	if (process.env.DEPLOYMENT_MODE === "cloud") {
		await boss.schedule(CLOUD_BILLING_RECONCILIATION_QUEUE, "* * * * *", { source: "scheduled" }, { tz: "UTC" });
		console.log("Scheduled cloud billing reconciliation (every minute)");
		await boss.schedule(CLOUD_TRACKING_DISPATCH_QUEUE, "* * * * *", { source: "scheduled" }, { tz: "UTC" });
		console.log("Scheduled cloud v2 tracking dispatcher (every minute)");
		await boss.schedule(
			CLOUD_PROVIDER_SPEND_REPORT_QUEUE,
			CLOUD_PROVIDER_SPEND_REPORT_SCHEDULE.cron,
			{ version: 1 },
			{ ...CLOUD_PROVIDER_SPEND_REPORT_SCHEDULE.options, key: CLOUD_PROVIDER_SPEND_REPORT_SCHEDULE.key },
		);
		console.log("Scheduled cloud provider spend report (daily at 01:15 UTC)");
	}

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.schedule("sync-auth0-memberships", "*/15 * * * *", { source: "scheduled" }, { tz: "UTC" });
		console.log("Scheduled Auth0 membership sync (every 15 minutes)");
	}

	// Register job handlers
	await registerHandlers(boss);
	await fs.writeFile(WORKER_READY_FILE, `${new Date().toISOString()}\n`, "utf8");
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
