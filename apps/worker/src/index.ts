import * as Sentry from "@sentry/node";
import { RUNS_PER_PROMPT } from "@workspace/lib/constants";
import { getProvider, parseScrapeTargets, validateScrapeTargets } from "@workspace/lib/providers";
import {
	ANALYZE_BRAND_QUEUE,
	ANALYZE_BRAND_QUEUE_OPTIONS,
	getPromptMaxProviderCalls,
	getProviderMaxConcurrency,
	getReportMaxProviderCalls,
	REPORT_QUEUE,
	REPORT_QUEUE_OPTIONS,
} from "@workspace/lib/scheduler";
import { startCredentialRefresh } from "@workspace/lib/secrets";
import boss from "./boss";
import { registerHandlers } from "./handlers";
import { closeLegacyPaidAdmission, cutOverLegacyPaidWork } from "./legacy-cutover";
import { DurablePromptScheduler } from "./scheduler";
import { shutdownTelemetry } from "./telemetry";

let promptScheduler: DurablePromptScheduler | null = null;

async function createPaidQueues(): Promise<void> {
	await boss.createQueue(REPORT_QUEUE, REPORT_QUEUE_OPTIONS);
	await boss.updateQueue(REPORT_QUEUE, REPORT_QUEUE_OPTIONS);
	await boss.createQueue(ANALYZE_BRAND_QUEUE, ANALYZE_BRAND_QUEUE_OPTIONS);
	await boss.updateQueue(ANALYZE_BRAND_QUEUE, ANALYZE_BRAND_QUEUE_OPTIONS);
}

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || "development",
		tracesSampleRate: 1.0,
	});
}

async function main() {
	console.log("Starting pg-boss worker...");
	// Close the old paid queues before configuration checks or pg-boss startup
	// can leave another admission window during an upgrade.
	await closeLegacyPaidAdmission();

	// Awaited so a stored credential counts toward the validation below.
	await startCredentialRefresh();

	const scrapeTargets = parseScrapeTargets(process.env.SCRAPE_TARGETS);
	validateScrapeTargets(scrapeTargets, getProvider);
	const promptProviderCalls = scrapeTargets.length * RUNS_PER_PROMPT;
	const promptProviderBudget = getPromptMaxProviderCalls();
	const providerMaxConcurrency = getProviderMaxConcurrency();
	const reportProviderBudget = getReportMaxProviderCalls();
	if (promptProviderCalls > promptProviderBudget) {
		throw new Error(
			`SCRAPE_TARGETS materializes ${promptProviderCalls} calls per prompt cycle, exceeding ` +
				`PROMPT_MAX_PROVIDER_CALLS=${promptProviderBudget}`,
		);
	}
	console.log(`SCRAPE_TARGETS validated (${promptProviderCalls}/${promptProviderBudget} calls per prompt cycle)`);
	console.log(
		`Provider controls validated (${providerMaxConcurrency} calls/provider, ${reportProviderBudget} calls/report)`,
	);
	promptScheduler = new DurablePromptScheduler(scrapeTargets);

	boss.on("error", (error) => {
		console.error("pg-boss error:", error);
		Sentry.withScope((scope) => {
			scope.setTag("source", "pg-boss-internal");
			Sentry.captureException(error);
		});
	});

	await boss.start();
	console.log("pg-boss started");
	// Fresh databases acquire the pg-boss tables during start; install the
	// trigger now before any paid handler is registered.
	await closeLegacyPaidAdmission();
	await createPaidQueues();
	await cutOverLegacyPaidWork();

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.createQueue("sync-auth0-memberships", {
			retryLimit: 3,
			retryDelay: 60,
			retryBackoff: true,
			expireInSeconds: 60 * 10,
		});
	}
	console.log("Queues created");

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.schedule("sync-auth0-memberships", "*/15 * * * *", { source: "scheduled" }, { tz: "UTC" });
		console.log("Scheduled Auth0 membership sync (every 15 minutes)");
	}

	await registerHandlers(boss);
	await promptScheduler.start();
	console.log("All handlers registered, worker is ready");
}

main().catch(async (error) => {
	Sentry.captureException(error);
	console.error("Failed to start worker:", error);
	await Sentry.flush(2000);
	process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;
	console.log(`Received ${signal}, shutting down gracefully...`);
	await Promise.all([promptScheduler?.stop(30000), boss.stop({ graceful: true, timeout: 30000 })]);
	await Promise.all([Sentry.flush(2000), shutdownTelemetry()]);
	console.log("Worker stopped");
	process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
