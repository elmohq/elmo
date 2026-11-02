import { db } from "@workspace/lib/db/db";
import { reports } from "@workspace/lib/db/schema";
import { describeReportPhase, type ReportPhase, reportProgress } from "@workspace/lib/reports/lifecycle";
import { eq } from "drizzle-orm";
import type { Job } from "pg-boss";
import { processReportJob, type ReportJobData } from "../report-worker";

export interface GenerateReportData extends ReportJobData {}

/**
 * Generate a report - runs website analysis, competitor research, and prompt testing.
 * This is a pg-boss job handler.
 */
export async function generateReportJob(jobs: Job<GenerateReportData>[]): Promise<void> {
	// pg-boss v12 passes an array of jobs - process each one
	for (const job of jobs) {
		const { reportId, brandName, brandAliases, brandWebsite, manualPrompts } = job.data;

		console.log(`Generating report ${reportId} for ${brandName}`);

		const log = (message: string) => console.log(`[Report ${reportId}] ${message}`);
		const enterPhase = async (phase: ReportPhase) => {
			const progress = reportProgress(phase);
			console.log(`[Report ${reportId}] ${describeReportPhase(phase)} (${progress}%)`);
			try {
				// Also the report's heartbeat: the maintenance sweep reads updatedAt to
				// tell a slow report from one whose worker is gone.
				await db.update(reports).set({ progress, updatedAt: new Date() }).where(eq(reports.id, reportId));
			} catch (err) {
				console.error(`[Report ${reportId}] Failed to persist progress:`, err);
			}
		};

		await processReportJob({
			data: {
				reportId,
				brandName,
				brandAliases,
				brandWebsite,
				manualPrompts,
			},
			log,
			enterPhase,
		});

		console.log(`Report ${reportId} completed successfully`);
	}
}
