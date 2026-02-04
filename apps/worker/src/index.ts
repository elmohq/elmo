import boss from "./boss";
import { registerHandlers } from "./handlers";

async function main() {
	console.log("Starting pg-boss worker...");

	// Start pg-boss (creates schema if needed)
	await boss.start();
	console.log("pg-boss started");

	// Create queues if they don't exist (required in pg-boss v12)
	await boss.createQueue("process-prompt", {
		retryLimit: 3,
		retryDelay: 60,
		retryBackoff: true,
		expireInSeconds: 60 * 15, // 15 minute timeout
	});
	await boss.createQueue("generate-report", {
		retryLimit: 3,
		retryDelay: 60,
		retryBackoff: true,
		expireInSeconds: 60 * 60, // 1 hour timeout for reports
	});
	console.log("Queues created");

	// Register job handlers
	await registerHandlers(boss);
	console.log("All handlers registered, worker is ready");
}

main().catch((error) => {
	console.error("Failed to start worker:", error);
	process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
	console.log("Received SIGTERM, shutting down gracefully...");
	await boss.stop({ graceful: true, timeout: 30000 });
	console.log("Worker stopped");
	process.exit(0);
});

process.on("SIGINT", async () => {
	console.log("Received SIGINT, shutting down gracefully...");
	await boss.stop({ graceful: true, timeout: 30000 });
	console.log("Worker stopped");
	process.exit(0);
});
