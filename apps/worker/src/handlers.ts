import type { PgBoss } from "pg-boss";
import { processPromptJob, type ProcessPromptData } from "./jobs/process-prompt";
import { generateReportJob, type GenerateReportData } from "./jobs/generate-report";
import { scheduleMaintenanceJob, type ScheduleMaintenanceData } from "./jobs/schedule-maintenance";
import { syncAuth0MembershipsJob, type SyncAuth0MembershipsData } from "./jobs/sync-auth0-memberships";

/**
 * Register all job handlers with pg-boss.
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
	// Process prompt job - runs AI models and saves results
	await boss.work<ProcessPromptData>(
		"process-prompt",
		{
			localConcurrency: 10, // Process up to 10 jobs concurrently
		},
		processPromptJob,
	);
	console.log("Registered handler: process-prompt");

	// Generate report job - creates brand visibility reports
	await boss.work<GenerateReportData>(
		"generate-report",
		{
			localConcurrency: 2, // Reports are heavy, limit concurrency
		},
		generateReportJob,
	);
	console.log("Registered handler: generate-report");

	// Schedule maintenance job - ensures all prompts have scheduled jobs
	await boss.work<ScheduleMaintenanceData>(
		"schedule-maintenance",
		{
			localConcurrency: 1,
		},
		scheduleMaintenanceJob,
	);
	console.log("Registered handler: schedule-maintenance");

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.work<SyncAuth0MembershipsData>(
			"sync-auth0-memberships",
			{
				localConcurrency: 1,
			},
			syncAuth0MembershipsJob,
		);
		console.log("Registered handler: sync-auth0-memberships");
	}
}
