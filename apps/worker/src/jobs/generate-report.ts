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
		const { reportId, brandName, brandWebsite, manualPrompts } = job.data;

		console.log(`Generating report ${reportId} for ${brandName}`);

		const log = (message: string) => console.log(`[Report ${reportId}] ${message}`);
		const updateProgress = (progress: number) => console.log(`[Report ${reportId}] Progress: ${progress}%`);

		await processReportJob({
			data: {
				reportId,
				brandName,
				brandWebsite,
				manualPrompts,
			},
			log,
			updateProgress,
		});

		console.log(`Report ${reportId} completed successfully`);
	}
}
