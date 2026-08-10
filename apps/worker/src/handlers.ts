import * as Sentry from "@sentry/node";
import { getDeployment } from "@workspace/deployment";
import { db } from "@workspace/lib/db/db";
import { reports } from "@workspace/lib/db/schema";
import type { OnboardingSuggestion } from "@workspace/lib/onboarding";
import {
	ANALYZE_BRAND_GENERATION_DEADLINE_MS,
	ANALYZE_BRAND_QUEUE,
	ANALYZE_BRAND_QUEUE_OPTIONS,
	REPORT_GENERATION_DEADLINE_MS,
	REPORT_QUEUE,
	REPORT_QUEUE_OPTIONS,
} from "@workspace/lib/scheduler";
import { createHash } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { ProviderFatalError } from "@workspace/lib/providers";
import { type AnalyzeBrandData, analyzeBrandJob } from "./jobs/analyze-brand";
import { type GenerateReportData, generateReportJob } from "./jobs/generate-report";
import { type SyncAuth0MembershipsData, syncAuth0MembershipsJob } from "./jobs/sync-auth0-memberships";
import { ProviderAdmissionDeferredError } from "./scheduler/admission";

function deferredJobId(jobId: string): string {
	const hex = createHash("sha256").update(`provider-admission-successor:${jobId}`).digest("hex").slice(0, 32);
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function generationDeadline(input: { raw?: string; queueName: string; now: Date }): Date {
	if (input.raw !== undefined) {
		const parsed = new Date(input.raw);
		return Number.isFinite(parsed.getTime()) ? parsed : input.now;
	}
	const lifetime =
		input.queueName === REPORT_QUEUE ? REPORT_GENERATION_DEADLINE_MS : ANALYZE_BRAND_GENERATION_DEADLINE_MS;
	return new Date(input.now.getTime() + lifetime);
}

async function generationDeadlineError(
	queueName: string,
	job: Job<unknown>,
	cause?: unknown,
): Promise<ProviderFatalError> {
	if (queueName === REPORT_QUEUE) {
		const reportId = (job.data as { reportId?: string }).reportId;
		if (reportId) {
			await db
				.update(reports)
				.set({ status: "failed", updatedAt: new Date() })
				.where(and(eq(reports.id, reportId), ne(reports.status, "completed")));
		}
	}
	return new ProviderFatalError(`Provider admission did not recover before the ${queueName} generation deadline`, {
		cause,
	});
}

/**
 * Wraps a pg-boss handler to report errors to Sentry before re-throwing.
 * Preserves the handler's return value (stored by pg-boss as the job output).
 */
function withSentry<T, R>(
	boss: PgBoss,
	queueName: string,
	queueOptions: typeof REPORT_QUEUE_OPTIONS | typeof ANALYZE_BRAND_QUEUE_OPTIONS,
	handler: (jobs: Job<T>[]) => Promise<R>,
): (jobs: Job<T>[]) => Promise<R> {
	return async (jobs) => {
		try {
			const now = new Date();
			for (const job of jobs) {
				const rawDeadline = (job.data as { generationDeadlineAt?: string }).generationDeadlineAt;
				if (rawDeadline !== undefined && generationDeadline({ raw: rawDeadline, queueName, now }) <= now) {
					throw await generationDeadlineError(queueName, job as Job<unknown>);
				}
			}
			return await handler(jobs);
		} catch (error) {
			if (error instanceof ProviderAdmissionDeferredError) {
				for (const job of jobs) {
					const rawDeadline = (job.data as { generationDeadlineAt?: string }).generationDeadlineAt;
					const now = new Date();
					const deadline = generationDeadline({ raw: rawDeadline, queueName, now });
					if (deadline <= now || error.retryAt >= deadline) {
						throw await generationDeadlineError(queueName, job as Job<unknown>, error);
					}
					const data =
						queueName === ANALYZE_BRAND_QUEUE
							? {
									...(job.data as object),
									generationDeadlineAt: deadline.toISOString(),
									requestId: (job.data as { requestId?: string }).requestId ?? job.id,
								}
							: { ...(job.data as object), generationDeadlineAt: deadline.toISOString() };
					await boss.send(queueName, data, {
						...queueOptions,
						id: deferredJobId(job.id),
						startAfter: error.retryAt,
					});
				}
				console.log(`[${queueName}] Deferred paid admission until ${error.retryAt.toISOString()}: ${error.message}`);
				return undefined as R;
			}
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
	if (getDeployment().features.reportGeneration) {
		await boss.work<GenerateReportData>(
			REPORT_QUEUE,
			{ localConcurrency: 1, includeMetadata: true },
			withSentry(boss, REPORT_QUEUE, REPORT_QUEUE_OPTIONS, generateReportJob),
		);
		console.log(`Registered handler: ${REPORT_QUEUE}`);
	}

	// batchSize: 1 keeps the returned suggestion mapped 1:1 to a single job's
	// output, which the web app reads back via getJobById.
	await boss.work<AnalyzeBrandData, OnboardingSuggestion>(
		ANALYZE_BRAND_QUEUE,
		{ batchSize: 1, localConcurrency: 2 },
		withSentry(boss, ANALYZE_BRAND_QUEUE, ANALYZE_BRAND_QUEUE_OPTIONS, analyzeBrandJob),
	);
	console.log(`Registered handler: ${ANALYZE_BRAND_QUEUE}`);

	if (process.env.DEPLOYMENT_MODE === "whitelabel") {
		await boss.work<SyncAuth0MembershipsData>(
			"sync-auth0-memberships",
			{ localConcurrency: 1 },
			withSentry(boss, "sync-auth0-memberships", ANALYZE_BRAND_QUEUE_OPTIONS, syncAuth0MembershipsJob),
		);
		console.log("Registered handler: sync-auth0-memberships");
	}
}
