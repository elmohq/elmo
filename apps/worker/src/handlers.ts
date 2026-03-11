import * as Sentry from "@sentry/node";
import type { Job, PgBoss } from "pg-boss";
import { processPromptJob, type ProcessPromptData } from "./jobs/process-prompt";
import { generateReportJob, type GenerateReportData } from "./jobs/generate-report";
import { scheduleMaintenanceJob, type ScheduleMaintenanceData } from "./jobs/schedule-maintenance";
import { syncAuth0MembershipsJob, type SyncAuth0MembershipsData } from "./jobs/sync-auth0-memberships";

/** Wraps a pg-boss handler to report errors to Sentry before re-throwing. */
function withSentry<T>(
	queueName: string,
	handler: (jobs: Job<T>[]) => Promise<void>,
): (jobs: Job<T>[]) => Promise<void> {
	return async (jobs) => {
		try {
			await handler(jobs);
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

	await boss.work<GenerateReportData>(
		"generate-report",
		{ localConcurrency: 2 },
		withSentry("generate-report", generateReportJob),
	);
	console.log("Registered handler: generate-report");

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
}
