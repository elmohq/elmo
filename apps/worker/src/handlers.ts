import * as Sentry from "@sentry/node";
import { CLOUD_BILLING_RECONCILIATION_QUEUE } from "@workspace/cloud/billing-control";
import { getDeployment } from "@workspace/deployment";
import { CLOUD_BRAND_ANALYSIS_QUEUE } from "@workspace/lib/cloud/brand-analysis-admission";
import { CLOUD_TRACKING_DISPATCH_QUEUE, CLOUD_TRACKING_TASK_QUEUE } from "@workspace/lib/cloud/tracking-policy";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import type { Job, JobWithMetadata, PgBoss } from "pg-boss";
import { type AnalyzeBrandData, analyzeBrandJob } from "./jobs/analyze-brand";
import { type DispatchTrackingV2Data, dispatchTrackingV2Job } from "./jobs/dispatch-tracking-v2";
import { type GenerateReportData, generateReportJob } from "./jobs/generate-report";
import { type ProcessPromptData, processPromptJob } from "./jobs/process-prompt";
import { type ProcessTrackingTaskV2Data, processTrackingTaskV2Job } from "./jobs/process-tracking-task-v2";
import { type ReconcileCloudBillingData, reconcileCloudBillingJob } from "./jobs/reconcile-cloud-billing";
import { type ScheduleMaintenanceData, scheduleMaintenanceJob } from "./jobs/schedule-maintenance";
import { type SyncAuth0MembershipsData, syncAuth0MembershipsJob } from "./jobs/sync-auth0-memberships";

/**
 * Wraps a pg-boss handler to report errors to Sentry before re-throwing.
 * Preserves the handler's return value (stored by pg-boss as the job output).
 */
function withSentry<T, R, TJob extends Job<T> = Job<T>>(
	queueName: string,
	handler: (jobs: TJob[]) => Promise<R>,
): (jobs: TJob[]) => Promise<R> {
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
	await boss.work<AnalyzeBrandData, OnboardingSuggestion, { batchSize: 1; localConcurrency: 2; includeMetadata: true }>(
		getDeployment().mode === "cloud" ? CLOUD_BRAND_ANALYSIS_QUEUE : "analyze-brand",
		{ batchSize: 1, localConcurrency: 2, includeMetadata: true },
		withSentry<AnalyzeBrandData, OnboardingSuggestion, JobWithMetadata<AnalyzeBrandData>>(
			getDeployment().mode === "cloud" ? CLOUD_BRAND_ANALYSIS_QUEUE : "analyze-brand",
			analyzeBrandJob,
		),
	);
	console.log(`Registered handler: ${getDeployment().mode === "cloud" ? CLOUD_BRAND_ANALYSIS_QUEUE : "analyze-brand"}`);

	await boss.work<ScheduleMaintenanceData>(
		"schedule-maintenance",
		{ localConcurrency: 1 },
		withSentry("schedule-maintenance", scheduleMaintenanceJob),
	);
	console.log("Registered handler: schedule-maintenance");

	if (process.env.DEPLOYMENT_MODE === "cloud") {
		await boss.work<ReconcileCloudBillingData>(
			CLOUD_BILLING_RECONCILIATION_QUEUE,
			{ localConcurrency: 1 },
			withSentry(CLOUD_BILLING_RECONCILIATION_QUEUE, reconcileCloudBillingJob),
		);
		console.log(`Registered handler: ${CLOUD_BILLING_RECONCILIATION_QUEUE}`);

		await boss.work<DispatchTrackingV2Data>(
			CLOUD_TRACKING_DISPATCH_QUEUE,
			{ localConcurrency: 1 },
			withSentry(CLOUD_TRACKING_DISPATCH_QUEUE, dispatchTrackingV2Job),
		);
		console.log(`Registered handler: ${CLOUD_TRACKING_DISPATCH_QUEUE}`);

		await boss.work<ProcessTrackingTaskV2Data>(
			CLOUD_TRACKING_TASK_QUEUE,
			{ batchSize: 1, localConcurrency: 10 },
			withSentry(CLOUD_TRACKING_TASK_QUEUE, processTrackingTaskV2Job),
		);
		console.log(`Registered handler: ${CLOUD_TRACKING_TASK_QUEUE}`);
	}

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.work<SyncAuth0MembershipsData>(
			"sync-auth0-memberships",
			{ localConcurrency: 1 },
			withSentry("sync-auth0-memberships", syncAuth0MembershipsJob),
		);
		console.log("Registered handler: sync-auth0-memberships");
	}
}
