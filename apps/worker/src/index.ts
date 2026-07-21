import * as Sentry from "@sentry/node";
import { getDeployment } from "@workspace/deployment";
import { ensureInstanceConfig } from "@workspace/lib/config/import";
import { getInstanceCatalog } from "@workspace/lib/config/resolve";
import { refreshCredentialOverlay } from "@workspace/lib/secrets";
import boss from "./boss";
import { registerHandlers } from "./handlers";
import { shutdownTelemetry } from "./telemetry";

const CREDENTIAL_REFRESH_INTERVAL_MS = 60_000;

if (process.env.SENTRY_DSN) {
	Sentry.init({
		dsn: process.env.SENTRY_DSN,
		environment: process.env.ENVIRONMENT || "development",
		tracesSampleRate: 1.0,
	});
}

async function main() {
	console.log("Starting pg-boss worker...");

	// One-shot env → DB config import (idempotent, advisory-locked) plus the
	// per-boot deprecation check and local-admin promotion.
	const importResult = await ensureInstanceConfig();
	console.log(
		`Instance config ready (imported: ${importResult.imported}, targets imported: ${importResult.targetsImported}` +
			`${importResult.skippedEntries.length > 0 ? `, skipped entries: ${importResult.skippedEntries.length}` : ""}` +
			`${importResult.promotedUserId ? `, promoted local admin: ${importResult.promotedUserId}` : ""})`,
	);

	// DB-backed provider credentials overlay env at read time; refresh failures
	// degrade to env-only credentials rather than blocking boot.
	try {
		await refreshCredentialOverlay();
	} catch (error) {
		console.warn("Failed to load provider credentials from DB — using env credentials only:", error);
	}
	setInterval(() => {
		refreshCredentialOverlay().catch((error) => {
			console.warn("Provider credential refresh failed — keeping previous credentials:", error);
		});
	}, CREDENTIAL_REFRESH_INTERVAL_MS).unref();

	// An empty catalog is warn-and-idle, never a crash-loop: queues and schedules
	// are still created, and maintenance revives work once targets exist.
	// Per-target readiness problems (missing keys etc.) are per-cycle skips.
	const catalog = await getInstanceCatalog();
	if (catalog.length === 0) {
		console.warn(
			"No targets configured — the worker will idle until targets exist. " +
				"Configure them in the app (Admin → Targets) or set SCRAPE_TARGETS for first-boot seeding.",
		);
	} else {
		console.log(`Target catalog loaded (${catalog.length} target(s))`);
	}

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
	console.log("Queues created");

	await boss.schedule("schedule-maintenance", "*/5 * * * *", { source: "scheduled" }, { tz: "UTC" });
	console.log("Scheduled maintenance job (every 5 minutes)");

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.schedule("sync-auth0-memberships", "*/15 * * * *", { source: "scheduled" }, { tz: "UTC" });
		console.log("Scheduled Auth0 membership sync (every 15 minutes)");
	}

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
