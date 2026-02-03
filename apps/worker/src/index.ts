import { DBOS } from "@dbos-inc/dbos-sdk";

import "./workflows/prompt-workflow";
import "./workflows/report-workflow";
import "./workflows/retention-workflow";

async function main() {
	await DBOS.launch();
	DBOS.logger.info("DBOS worker started");
}

main().catch((error) => {
	DBOS.logger.error(`Failed to start DBOS worker: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
