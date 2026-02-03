import { DBOS } from "@dbos-inc/dbos-sdk";
import { processReportJob, type ReportJobData } from "../report-worker";

async function generateReportWorkflow(
	reportId: string,
	brandName: string,
	brandWebsite: string,
	manualPrompts?: string[],
) {
	const data: ReportJobData = {
		reportId,
		brandName,
		brandWebsite,
		manualPrompts,
	};

	const log = (message: string) => DBOS.logger.info(message);
	const updateProgress = (progress: number) => DBOS.logger.info(`Report progress: ${progress}%`);

	await DBOS.runStep(
		() =>
			processReportJob({
				data,
				log,
				updateProgress,
			}),
		{
			name: "processReportJob",
			retriesAllowed: true,
			maxAttempts: 3,
			intervalSeconds: 5,
			backoffRate: 2,
		},
	);

	return { success: true, reportId };
}

export const generateReport = DBOS.registerWorkflow(generateReportWorkflow, {
	name: "generateReport",
	maxRecoveryAttempts: 3,
});
