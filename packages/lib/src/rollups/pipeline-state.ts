import { eq } from "drizzle-orm";
import type { DbConnection } from "../db/db-connection";
import { type PipelineState, pipelineState } from "../db/schema";

export type PipelineStatePatch = Partial<Omit<PipelineState, "id">>;

const SINGLETON_ID = 1;

/**
 * The singleton row. `forUpdate` locks it for the rest of the transaction, which
 * is what keeps two workers from enqueueing the same one-shot work twice.
 */
export async function getPipelineState(
	conn: DbConnection,
	options: { forUpdate?: boolean } = {},
): Promise<PipelineState> {
	const query = conn.select().from(pipelineState).where(eq(pipelineState.id, SINGLETON_ID)).limit(1);
	const [row] = await (options.forUpdate ? query.for("update") : query);
	if (!row) throw new Error("pipeline_state row missing; run migrations");
	return row;
}

export async function setPipelineState(conn: DbConnection, patch: PipelineStatePatch): Promise<void> {
	if (Object.keys(patch).length === 0) return;
	await conn.update(pipelineState).set(patch).where(eq(pipelineState.id, SINGLETON_ID));
}
