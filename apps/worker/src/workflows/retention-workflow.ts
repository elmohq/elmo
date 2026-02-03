import { DBOS, SchedulerMode } from "@dbos-inc/dbos-sdk";
import { Client } from "pg";

const RETENTION_DAYS = 90;

async function cleanupDbosHistory(_: Date, __: Date) {
	const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
	const connectionString = process.env.DBOS_SYSTEM_DATABASE_URL;

	if (!connectionString) {
		throw new Error("DBOS_SYSTEM_DATABASE_URL is required for retention cleanup.");
	}

	const client = new Client({ connectionString });
	await client.connect();

	try {
		const deleteOperationOutputs = await client.query(
			"DELETE FROM dbos.operation_outputs WHERE completed_at_epoch_ms < $1",
			[cutoffMs],
		);
		const deleteWorkflowStatus = await client.query(
			"DELETE FROM dbos.workflow_status WHERE updated_at < $1",
			[cutoffMs],
		);

		DBOS.logger.info(
			`Retention cleanup removed ${deleteOperationOutputs.rowCount ?? 0} operation_outputs and ${deleteWorkflowStatus.rowCount ?? 0} workflow_status rows`,
		);
	} finally {
		await client.end();
	}
}

const retentionWorkflow = DBOS.registerWorkflow(cleanupDbosHistory, {
	name: "dbosRetentionCleanup",
});

DBOS.registerScheduled(retentionWorkflow, {
	crontab: "0 2 * * *",
	mode: SchedulerMode.ExactlyOncePerIntervalWhenActive,
});
