import { DBOS } from "@dbos-inc/dbos-sdk";

// Import queues first to register them before workflows
import "./queues";

import "./workflows/prompt-workflow";
import "./workflows/report-workflow";
import "./workflows/retention-workflow";

async function main() {
	const systemDatabaseUrl = process.env.DBOS_SYSTEM_DATABASE_URL;
	if (!systemDatabaseUrl) {
		throw new Error("DBOS_SYSTEM_DATABASE_URL is required to start the worker.");
	}

	DBOS.setConfig({
		name: "elmo-worker",
		systemDatabaseUrl,
		// Fixed application version ensures workflows survive normal code deploys.
		// All worker instances use the same version, so multiple workers work correctly.
		// Only bump this if you make BREAKING changes to workflow step order/logic.
		applicationVersion: "v1",
	});

	await DBOS.launch();
	DBOS.logger.info("DBOS worker started");
}

main().catch((error) => {
	DBOS.logger.error(`Failed to start DBOS worker: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
