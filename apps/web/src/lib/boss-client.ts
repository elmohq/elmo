import { PgBoss } from "pg-boss";
import {
	ANALYZE_BRAND_QUEUE,
	ANALYZE_BRAND_QUEUE_OPTIONS,
	REPORT_QUEUE,
	REPORT_QUEUE_OPTIONS,
} from "@workspace/lib/scheduler";

let bossInstance: PgBoss | null = null;
let bossPromise: Promise<PgBoss> | null = null;

/**
 * Get or create a pg-boss client instance.
 * Uses singleton pattern to avoid multiple connections.
 */
export async function getBoss(): Promise<PgBoss> {
	if (bossInstance) {
		return bossInstance;
	}

	if (bossPromise) {
		return bossPromise;
	}

	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL is required for pg-boss");
	}

	bossPromise = (async () => {
		const boss = new PgBoss({
			connectionString,
			schema: "pgboss",
			// Web app only needs to send/schedule jobs, not process them
			supervise: false, // Let worker handle supervision
		});

		await boss.start();

		// Create queues if they don't exist (required in pg-boss v12)
		// createQueue is idempotent - safe to call multiple times
		await boss.createQueue(REPORT_QUEUE, REPORT_QUEUE_OPTIONS);
		await boss.updateQueue(REPORT_QUEUE, REPORT_QUEUE_OPTIONS);
		await boss.createQueue(ANALYZE_BRAND_QUEUE, ANALYZE_BRAND_QUEUE_OPTIONS);
		await boss.updateQueue(ANALYZE_BRAND_QUEUE, ANALYZE_BRAND_QUEUE_OPTIONS);

		bossInstance = boss;
		return boss;
	})();

	return bossPromise;
}

/**
 * Stop the pg-boss client (for graceful shutdown).
 */
export async function stopBoss(): Promise<void> {
	if (bossInstance) {
		await bossInstance.stop();
		bossInstance = null;
		bossPromise = null;
	}
}
