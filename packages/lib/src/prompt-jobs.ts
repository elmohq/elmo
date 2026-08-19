/**
 * How a prompt's job is addressed on the queue, and how a configuration change
 * brings its next cycle forward.
 *
 * The web app's scheduler, the worker's reschedule, the maintenance sweep, and
 * the expedite path all send to the same queue under the same singleton key.
 * They have to agree on that addressing exactly — a mismatch doesn't error, it
 * silently drops the send — so it is resolved here rather than spelled out at
 * each call site.
 */

import { sql } from "drizzle-orm";
import { db } from "./db/db";

export const PROMPT_QUEUE = "process-prompt";

/** Dedup window for a job meant to run now. */
export const IMMEDIATE_SINGLETON_SECONDS = 60 * 60;

export interface PromptJobSendOptions {
	singletonKey: string;
	singletonSeconds: number;
	startAfter?: number;
}

/**
 * Queue addressing for one prompt's job. Omit `startAfterSeconds` for a job
 * that should run now; pass it to hold the job back by that long.
 */
export function promptJobSendOptions(promptId: string, startAfterSeconds?: number): PromptJobSendOptions {
	const singletonKey = `prompt-${promptId}`;
	if (startAfterSeconds === undefined) {
		return { singletonKey, singletonSeconds: IMMEDIATE_SINGLETON_SECONDS };
	}
	return { singletonKey, singletonSeconds: startAfterSeconds, startAfter: startAfterSeconds };
}

/** The slice of pg-boss this module needs, so lib doesn't take on the dependency. */
export interface PromptJobSender {
	send(queue: string, data: { promptId: string }, options: PromptJobSendOptions): Promise<string | null>;
}

/**
 * Bring prompts' next cycle forward after a configuration change — platforms
 * added to a brand, a premium model added to a prompt — so the change takes
 * effect now rather than whenever the current cadence happens to come around.
 *
 * Cheap to call on any save: the cycle it triggers runs only the targets that
 * are actually due, so platforms that ran recently are skipped rather than
 * paid for a second time.
 *
 * Throws on failure. Callers on a user-facing save path decide whether that
 * should surface, since maintenance reaches the same state on its own.
 */
export async function expeditePromptRuns(sender: PromptJobSender, promptIds: string[]): Promise<void> {
	if (promptIds.length === 0) return;

	const idList = sql.join(
		promptIds.map((id) => sql`${id}`),
		sql`, `,
	);
	const result = await db.execute(sql`
		UPDATE pgboss.job
		SET start_after = now()
		WHERE name = ${PROMPT_QUEUE}
		  AND state = 'created'
		  AND (data->>'promptId') IN (${idList})
		RETURNING (data->>'promptId') AS prompt_id
	`);

	const moved = new Set((result.rows as { prompt_id: string }[]).map((row) => row.prompt_id));
	const unqueued = promptIds.filter((id) => !moved.has(id));

	await Promise.all(
		unqueued.map((promptId) => sender.send(PROMPT_QUEUE, { promptId }, promptJobSendOptions(promptId))),
	);
}
