import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { db } from "@workspace/lib/db/db";
import { reports } from "@workspace/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Job, JobWithMetadata } from "pg-boss";
import { processReportJob, type ReportJobData } from "../report-worker";

export interface GenerateReportData extends ReportJobData {}

/**
 * Generate a report - runs website analysis, competitor research, and prompt testing.
 * This is a pg-boss job handler.
 */
export async function generateReportJob(jobs: Job<GenerateReportData>[]): Promise<void> {
	// pg-boss v12 passes an array of jobs - process each one
	for (const job of jobs) {
		const metadata = job as JobWithMetadata<GenerateReportData>;
		const { reportId, brandName, brandWebsite, manualPrompts } = job.data;
		const [claimed] = await db
			.update(reports)
			.set({ status: "processing", updatedAt: new Date() })
			.where(and(eq(reports.id, reportId), inArray(reports.status, ["pending", "processing"])))
			.returning({ id: reports.id });
		if (!claimed) {
			console.warn(`Skipping report ${reportId}: it is already terminal`);
			continue;
		}

		console.log(`Generating report ${reportId} for ${brandName}`);

		const log = (message: string) => console.log(`[Report ${reportId}] ${message}`);
		const updateProgress = async (progress: number) => {
			console.log(`[Report ${reportId}] Progress: ${progress}%`);
			try {
				await db
					.update(reports)
					.set({ progress: Math.round(progress) })
					.where(eq(reports.id, reportId));
			} catch (err) {
				console.error(`[Report ${reportId}] Failed to persist progress:`, err);
			}
		};

		await processReportJob({
			data: {
				reportId,
				brandName,
				brandWebsite,
				manualPrompts,
			},
			workerId: `${hostname()}:${process.pid}:report:${job.id}:${randomUUID()}`,
			log,
			updateProgress,
			signal: job.signal,
			finalAttempt: metadata.retryCount >= metadata.retryLimit,
		});

		console.log(`Report ${reportId} completed successfully`);
	}
}
