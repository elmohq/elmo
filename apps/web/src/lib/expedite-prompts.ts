import { db } from "@workspace/lib/db/db";
import { sql } from "drizzle-orm";
import { createMultiplePromptJobSchedulers } from "@/lib/job-scheduler";

/**
 * Bring prompts' next cycle forward after a configuration change — platforms
 * added to a brand, a premium model added to a prompt — so the change takes
 * effect now rather than whenever the current cadence happens to come around.
 *
 * Dragging the queued row forward is the only thing that works here: the
 * `prompt-${id}` singleton swallows a fresh send while a future job exists, so
 * `boss.send` would silently do nothing. Same UPDATE the worker's
 * schedule-maintenance uses to revive stalled chains.
 *
 * Safe to call on any save, and cheap: the cycle it triggers runs only the
 * targets that are actually due, so platforms that ran recently are skipped
 * rather than paid for a second time.
 *
 * Best-effort by design. A prompt whose cycle is mid-flight has no queued row
 * to move and holds the singleton against a new one, so its added target waits
 * for maintenance to expedite the job that cycle queues on its way out.
 */
export async function expeditePromptRuns(promptIds: string[]): Promise<void> {
	if (promptIds.length === 0) return;

	try {
		const idList = sql.join(
			promptIds.map((id) => sql`${id}`),
			sql`, `,
		);
		const result = await db.execute(sql`
			UPDATE pgboss.job
			SET start_after = now()
			WHERE name = 'process-prompt'
			  AND state = 'created'
			  AND (data->>'promptId') IN (${idList})
			RETURNING (data->>'promptId') AS prompt_id
		`);

		const moved = new Set((result.rows as { prompt_id: string }[]).map((row) => row.prompt_id));
		const unqueued = promptIds.filter((id) => !moved.has(id));
		if (unqueued.length > 0) {
			await createMultiplePromptJobSchedulers(unqueued);
		}
	} catch (error) {
		// Never fail the save over this: maintenance reaches the same state on its
		// own, just an hour later.
		console.error("Failed to expedite prompt runs:", error);
	}
}
