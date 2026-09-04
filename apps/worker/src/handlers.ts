import * as Sentry from "@sentry/node";
import { getDeployment } from "@workspace/deployment";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import { REFRESH_ROLLUPS_QUEUE, REPROCESS_QUEUE } from "@workspace/lib/rollups/constants";
import type { Job, PgBoss } from "pg-boss";
import { type AnalyzeBrandData, analyzeBrandJob } from "./jobs/analyze-brand";
import { type GenerateReportData, generateReportJob } from "./jobs/generate-report";
import { type ProcessPromptData, processPromptJob } from "./jobs/process-prompt";
import { RECONCILE_ROLLUPS_QUEUE, type ReconcileRollupsData, reconcileRollupsJob } from "./jobs/reconcile-rollups";
import { type RefreshRollupsData, refreshRollupsJob } from "./jobs/refresh-rollups";
import { type ReprocessData, reprocessJob } from "./jobs/reprocess";
import { type ScheduleMaintenanceData, scheduleMaintenanceJob } from "./jobs/schedule-maintenance";
import { type SyncAuth0MembershipsData, syncAuth0MembershipsJob } from "./jobs/sync-auth0-memberships";

/**
 * Wraps a pg-boss handler to report errors to Sentry before re-throwing.
 * Preserves the handler's return value (stored by pg-boss as the job output).
 */
function withSentry<T, R>(queueName: string, handler: (jobs: Job<T>[]) => Promise<R>): (jobs: Job<T>[]) => Promise<R> {
	return async (jobs) => {
		try {
			return await handler(jobs);
		} catch (error) {
			Sentry.withScope((scope) => {
				scope.setTag("queue", queueName);
				Sentry.captureException(error);
			});
			throw error;
		}
	};
}

/**
 * Register all job handlers with pg-boss.
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
	await boss.work<ProcessPromptData>(
		"process-prompt",
		{ localConcurrency: 10 },
		withSentry("process-prompt", processPromptJob),
	);
	console.log("Registered handler: process-prompt");

	if (getDeployment().features.reportGeneration) {
		await boss.work<GenerateReportData>(
			"generate-report",
			{ localConcurrency: 2 },
			withSentry("generate-report", generateReportJob),
		);
		console.log("Registered handler: generate-report");
	}

	// batchSize: 1 keeps the returned suggestion mapped 1:1 to a single job's
	// output, which the web app reads back via getJobById.
	await boss.work<AnalyzeBrandData, OnboardingSuggestion>(
		"analyze-brand",
		{ batchSize: 1, localConcurrency: 2 },
		withSentry("analyze-brand", analyzeBrandJob),
	);
	console.log("Registered handler: analyze-brand");

	await boss.work<ScheduleMaintenanceData>(
		"schedule-maintenance",
		{ localConcurrency: 1 },
		withSentry("schedule-maintenance", scheduleMaintenanceJob),
	);
	console.log("Registered handler: schedule-maintenance");

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.work<SyncAuth0MembershipsData>(
			"sync-auth0-memberships",
			{ localConcurrency: 1 },
			withSentry("sync-auth0-memberships", syncAuth0MembershipsJob),
		);
		console.log("Registered handler: sync-auth0-memberships");
	}

	await boss.work<RefreshRollupsData>(
		REFRESH_ROLLUPS_QUEUE,
		{ localConcurrency: 1 },
		withSentry(REFRESH_ROLLUPS_QUEUE, refreshRollupsJob),
	);
	console.log(`Registered handler: ${REFRESH_ROLLUPS_QUEUE}`);

	await boss.work<ReconcileRollupsData>(
		RECONCILE_ROLLUPS_QUEUE,
		{ localConcurrency: 1 },
		withSentry(RECONCILE_ROLLUPS_QUEUE, reconcileRollupsJob),
	);
	console.log(`Registered handler: ${RECONCILE_ROLLUPS_QUEUE}`);

	await boss.work<ReprocessData>(REPROCESS_QUEUE, { localConcurrency: 1 }, withSentry(REPROCESS_QUEUE, reprocessJob));
	console.log(`Registered handler: ${REPROCESS_QUEUE}`);
}
