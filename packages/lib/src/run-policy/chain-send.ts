import type { Pool } from "pg";
import type { ChainStopped } from "./reschedule";

/** The one pg-boss capability a chain send needs, enlistable in a caller-owned transaction. */
export interface ChainSender {
	send(queue: string, data: object, options: Record<string, unknown>): Promise<string | null>;
}

/**
 * Insert one process-prompt chain job only if its prompt still exists and is
 * enabled, decided inside the transaction that inserts it. The prompt row is
 * share-locked first, so a disable or delete of that prompt — which updates or
 * removes the row and then cancels the queued chain jobs it finds — either
 * waits for this insert to commit and cancels it, or has already committed and
 * the row reads disabled or gone here and nothing is inserted. A check made
 * before the send, outside its transaction, can pass and still insert after the
 * disable has landed.
 *
 * Resolves like pg-boss `send` (job id, or null when throttled) plus the
 * stopped case, so the exactly-one-chain logic can tell the three apart.
 */
export async function sendChainJobIfEnabled(
	pool: Pool,
	boss: ChainSender,
	promptId: string,
	queue: string,
	data: object,
	options: Record<string, unknown>,
): Promise<string | null | ChainStopped> {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const { rows } = await client.query<{ enabled: boolean }>(
			"select enabled from prompts where id = $1::uuid for share",
			[promptId],
		);
		const row = rows[0];
		if (!row || !row.enabled) {
			await client.query("rollback");
			return { stopped: row ? "disabled" : "missing" };
		}
		const jobId = await boss.send(queue, data, {
			...options,
			db: { executeSql: (text: string, values?: unknown[]) => client.query(text, values) },
		});
		await client.query("commit");
		return jobId;
	} catch (error) {
		await client.query("rollback").catch(() => {});
		throw error;
	} finally {
		client.release();
	}
}
