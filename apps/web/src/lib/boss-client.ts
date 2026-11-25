import { pool } from "@workspace/lib/db/db";
import { PROCESS_PROMPT_QUEUE, PROMPT_JOB_OPTIONS } from "@workspace/lib/queues/prompt-jobs";
import { GENERATE_REPORT_QUEUE, REPORT_JOB_OPTIONS } from "@workspace/lib/queues/report-jobs";
import { PgBoss } from "pg-boss";

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

	bossPromise = (async () => {
		const boss = new PgBoss({
			db: { executeSql: (text, values) => pool.query(text, values) },
			schema: "pgboss",
			// Web app only needs to send/schedule jobs, not process them
			supervise: false, // Let worker handle supervision
		});
		// An EventEmitter with no "error" listener throws, which turns a transient
		// database blip in pg-boss's background queue refresh into an unhandled rejection.
		boss.on("error", (error) => console.error("[pg-boss]", error));

		await boss.start();

		// Create queues if they don't exist (required in pg-boss v12)
		// createQueue is idempotent - safe to call multiple times
		await boss.createQueue(PROCESS_PROMPT_QUEUE, PROMPT_JOB_OPTIONS);
		await boss.createQueue(GENERATE_REPORT_QUEUE, REPORT_JOB_OPTIONS);
		await boss.createQueue("analyze-brand", {
			retryLimit: 1,
			retryDelay: 10,
			retryBackoff: false,
			expireInSeconds: 60 * 15,
		});
		await boss.createQueue("suggest-prompts", {
			retryLimit: 1,
			retryDelay: 10,
			retryBackoff: false,
			expireInSeconds: 60 * 15,
		});

		bossInstance = boss;
		return boss;
	})();

	return bossPromise;
}
