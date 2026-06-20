import type { Job } from "pg-boss";
import { db } from "@workspace/lib/db/db";
import { promptRuns } from "@workspace/lib/db/schema";
import { tryExtractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq, gt, isNull } from "drizzle-orm";

export interface BackfillTextContentData {
	source?: string; // For logging - "startup" or "manual"
}

const BATCH_SIZE = 100;

/**
 * One-off backfill: populate prompt_runs.text_content for historical rows by
 * re-extracting the answer text from raw_output.
 *
 * Batched (keyset pagination on id), resumable (only touches rows where
 * text_content IS NULL), and idempotent — safe to enqueue on every worker
 * startup. Rows whose raw_output yields no extractable text are left NULL.
 */
export async function backfillTextContentJob(jobs: Job<BackfillTextContentData>[]): Promise<void> {
	for (const job of jobs) {
		const source = job.data?.source || "startup";
		console.log(`[backfill-text-content] Starting backfill (source: ${source})`);

		let processed = 0;
		let populated = 0;
		let unextractable = 0;
		let lastId: string | null = null;

		for (;;) {
			const rows = await db
				.select({
					id: promptRuns.id,
					rawOutput: promptRuns.rawOutput,
					provider: promptRuns.provider,
					model: promptRuns.model,
				})
				.from(promptRuns)
				.where(
					and(isNull(promptRuns.textContent), ...(lastId ? [gt(promptRuns.id, lastId)] : [])),
				)
				.orderBy(asc(promptRuns.id))
				.limit(BATCH_SIZE);

			if (rows.length === 0) break;

			for (const row of rows) {
				const text = tryExtractTextContent(row.rawOutput, row.provider ?? row.model);
				if (text !== null) {
					await db.update(promptRuns).set({ textContent: text }).where(eq(promptRuns.id, row.id));
					populated++;
				} else {
					unextractable++;
				}
				processed++;
			}

			lastId = rows[rows.length - 1].id;
			console.log(
				`[backfill-text-content] Progress: processed=${processed} populated=${populated} unextractable=${unextractable}`,
			);
		}

		console.log(
			`[backfill-text-content] Done: processed=${processed} populated=${populated} unextractable=${unextractable}`,
		);
	}
}
