import * as Sentry from "@sentry/node";
import { getDeploymentFeatures } from "@workspace/deployment";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import { PROCESS_PROMPT_QUEUE } from "@workspace/lib/queues/prompt-jobs";
import { GENERATE_REPORT_QUEUE } from "@workspace/lib/queues/report-jobs";
import { REFRESH_ROLLUPS_QUEUE, ROLLUP_CATCH_UP_QUEUE } from "@workspace/lib/rollups/constants";
import type { Job, PgBoss } from "pg-boss";
import { type AnalyzeBrandData, analyzeBrandJob } from "./jobs/analyze-brand";
import { DERIVE_RUNS_QUEUE, type DeriveRunsData, deriveRunsJob } from "./jobs/derive-runs";
import { type GenerateReportData, generateReportJob } from "./jobs/generate-report";
import { type ProcessPromptData, processPromptJob } from "./jobs/process-prompt";
import { type RefreshRollupsData, refreshRollupsJob } from "./jobs/refresh-rollups";
import {
	REPROCESS_QUEUE,
	REQUEST_REPROCESSES_QUEUE,
	type ReprocessData,
	reprocessJob,
	requestReprocessesJob,
} from "./jobs/reprocess";
import { type RollupCatchUpData, rollupCatchUpJob } from "./jobs/rollup-catch-up";
import { MAINTENANCE_CRON, type ScheduleMaintenanceData, scheduleMaintenanceJob } from "./jobs/schedule-maintenance";
import { type SuggestPromptsData, type SuggestPromptsResult, suggestPromptsJob } from "./jobs/suggest-prompts";
import { type SyncAuth0MembershipsData, syncAuth0MembershipsJob } from "./jobs/sync-auth0-memberships";
import { mentionAnalyzer } from "./mention-judge";
import { JOB_SAMPLE_RATE_ATTRIBUTE, JOB_SPAN_OP, JOB_TRACE_RATE } from "./tracing";

interface JobTracing {
	sampleRate?: number;
	/** Checks in with a Sentry cron monitor on every run, so a worker that stops running jobs raises an issue. */
	monitor?: { slug: string; config: NonNullable<Parameters<typeof Sentry.withMonitor>[2]> };
}

/** Passes the handler's return value through: pg-boss stores it as the job output. */
function withSentry<T, R>(
	queueName: string,
	handler: (jobs: Job<T>[]) => Promise<R>,
	{ sampleRate = JOB_TRACE_RATE.routine, monitor }: JobTracing = {},
): (jobs: Job<T>[]) => Promise<R> {
	const run = (jobs: Job<T>[]) =>
		Sentry.withIsolationScope((scope) => {
			scope.setTag("queue", queueName);
			return Sentry.startNewTrace(() =>
				Sentry.startSpan(
					{
						name: queueName,
						op: JOB_SPAN_OP,
						forceTransaction: true,
						attributes: {
							"messaging.system": "pg-boss",
							"messaging.destination.name": queueName,
							"messaging.message.id": jobs[0]?.id,
							"messaging.message.retry.count": jobs[0]?.retryCount,
							"messaging.batch.message_count": jobs.length,
							[JOB_SAMPLE_RATE_ATTRIBUTE]: sampleRate,
						},
					},
					async () => {
						try {
							return await handler(jobs);
						} catch (error) {
							Sentry.captureException(error);
							throw error;
						}
					},
				),
			);
		});

	if (!monitor) return run;
	return (jobs) => Sentry.withMonitor(monitor.slug, () => run(jobs), monitor.config);
}

// Maintenance runs every five minutes whatever else is queued, so a missed check-in means the worker is down.
const MAINTENANCE_MONITOR = {
	slug: "worker-schedule-maintenance",
	config: {
		schedule: { type: "crontab", value: MAINTENANCE_CRON },
		timezone: "UTC",
		checkinMargin: 5,
		maxRuntime: 10,
		failureIssueThreshold: 2,
		recoveryThreshold: 1,
		isolateTrace: true,
	},
} satisfies JobTracing["monitor"];

export async function registerHandlers(boss: PgBoss): Promise<void> {
	await boss.work<ProcessPromptData>(
		PROCESS_PROMPT_QUEUE,
		{ localConcurrency: 10 },
		withSentry(PROCESS_PROMPT_QUEUE, processPromptJob),
	);
	console.log(`Registered handler: ${PROCESS_PROMPT_QUEUE}`);

	if (getDeploymentFeatures().reportGeneration) {
		await boss.work<GenerateReportData>(
			GENERATE_REPORT_QUEUE,
			{ localConcurrency: 2 },
			withSentry(GENERATE_REPORT_QUEUE, generateReportJob, { sampleRate: JOB_TRACE_RATE.rare }),
		);
		console.log("Registered handler: generate-report");
	}

	// batchSize: 1 keeps the returned suggestion mapped 1:1 to a single job's
	// output, which the web app reads back via getJobById.
	await boss.work<AnalyzeBrandData, OnboardingSuggestion>(
		"analyze-brand",
		{ batchSize: 1, localConcurrency: 2 },
		withSentry("analyze-brand", analyzeBrandJob, { sampleRate: JOB_TRACE_RATE.rare }),
	);
	console.log("Registered handler: analyze-brand");

	await boss.work<SuggestPromptsData, SuggestPromptsResult>(
		"suggest-prompts",
		{ batchSize: 1, localConcurrency: 2 },
		withSentry("suggest-prompts", suggestPromptsJob, { sampleRate: JOB_TRACE_RATE.rare }),
	);
	console.log("Registered handler: suggest-prompts");

	await boss.work<ScheduleMaintenanceData>(
		"schedule-maintenance",
		{ localConcurrency: 1 },
		withSentry("schedule-maintenance", scheduleMaintenanceJob, {
			sampleRate: JOB_TRACE_RATE.cron,
			// A development worker comes and goes, and each stop would read as an outage.
			monitor: process.env.NODE_ENV === "production" ? MAINTENANCE_MONITOR : undefined,
		}),
	);
	console.log("Registered handler: schedule-maintenance");

	// One chunk per job, so each retries on its own.
	await boss.work<DeriveRunsData>(
		DERIVE_RUNS_QUEUE,
		{ batchSize: 1, localConcurrency: mentionAnalyzer().concurrency },
		withSentry(DERIVE_RUNS_QUEUE, deriveRunsJob),
	);
	console.log(`Registered handler: ${DERIVE_RUNS_QUEUE}`);

	await boss.work<ReprocessData>(REPROCESS_QUEUE, { localConcurrency: 1 }, withSentry(REPROCESS_QUEUE, reprocessJob));
	console.log(`Registered handler: ${REPROCESS_QUEUE}`);
	await boss.work(
		REQUEST_REPROCESSES_QUEUE,
		withSentry(REQUEST_REPROCESSES_QUEUE, requestReprocessesJob, { sampleRate: JOB_TRACE_RATE.cron }),
	);
	console.log(`Registered handler: ${REQUEST_REPROCESSES_QUEUE}`);

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.work<SyncAuth0MembershipsData>(
			"sync-auth0-memberships",
			{ localConcurrency: 1 },
			withSentry("sync-auth0-memberships", syncAuth0MembershipsJob, { sampleRate: JOB_TRACE_RATE.cron }),
		);
		console.log("Registered handler: sync-auth0-memberships");
	}

	await boss.work<RefreshRollupsData>(
		REFRESH_ROLLUPS_QUEUE,
		{ localConcurrency: 1 },
		withSentry(REFRESH_ROLLUPS_QUEUE, refreshRollupsJob, { sampleRate: JOB_TRACE_RATE.cron }),
	);
	console.log(`Registered handler: ${REFRESH_ROLLUPS_QUEUE}`);

	await boss.work<RollupCatchUpData>(
		ROLLUP_CATCH_UP_QUEUE,
		{ localConcurrency: 1 },
		withSentry(ROLLUP_CATCH_UP_QUEUE, rollupCatchUpJob),
	);
	console.log(`Registered handler: ${ROLLUP_CATCH_UP_QUEUE}`);
}
