import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import type { JobInsert, PgBoss } from "pg-boss";
import { cuedAnalyzer } from "../../mention-judge/__fixtures__/cued-judge";
import type { MentionAnalyzer } from "../../mention-judge/analyze";
import { DERIVE_RUNS_QUEUE, type DeriveRunsData, deriveRuns } from "../derive-runs";

interface QueuedJob {
	data: DeriveRunsData;
	priority: number;
}

/** Stands in for the derive-runs queue: keeps what's sent, and works it the way pg-boss would. */
export function deriveQueue(
	conn: DbConnection = db,
	analyzer: MentionAnalyzer = cuedAnalyzer,
	days: number | null = 90,
) {
	const jobs: QueuedJob[] = [];
	const boss: Pick<PgBoss, "insert" | "send"> = {
		insert: async (queue: string, batch: JobInsert[]) => {
			if (queue === DERIVE_RUNS_QUEUE) jobs.push(...(batch as QueuedJob[]));
			return null;
		},
		send: async () => null,
	};
	return {
		boss,
		jobs,
		/** Works every job, highest priority first, as one worker would; returns the jobs that failed. */
		async drain(): Promise<DeriveRunsData[]> {
			const failed: DeriveRunsData[] = [];
			for (;;) {
				jobs.sort((a, b) => b.priority - a.priority);
				const job = jobs.shift();
				if (!job) return failed;
				await deriveRuns(job.data, conn, boss, analyzer, days).catch(() => failed.push(job.data));
			}
		},
	};
}
