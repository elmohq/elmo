import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { onPages, walkHeap } from "@workspace/lib/db/heap-walk";
import { loadRawOutputs, updateExtractions } from "@workspace/lib/db/runs";
import { promptRuns, runExtractions } from "@workspace/lib/db/schema";
import { tryExtractTextContent } from "@workspace/lib/text-extraction";
import { and, eq, isNull, sql } from "drizzle-orm";

/** The extraction stamp of a run whose text was filled in but whose citations are as recorded. */
export const LEGACY_EXTRACTION_STAMP = "legacy";

/**
 * Stores text for runs that predate stored text, from their own payloads: what
 * their pages already extract on every view, so nothing visible changes. Their
 * citations and mentions stay as recorded, and the `legacy` stamp still reads as
 * stale to a real extraction replay. Walks `prompt_runs` newest pages first (see
 * `walkHeap`); resumable, since filled runs leave the filter.
 */
export function fillLegacyText(conn: DbConnection = db, pagesPerStep = 50): Promise<number> {
	return walkHeap(conn, promptRuns, pagesPerStep, async (from, to) => {
		const runs = await conn
			.select({ id: promptRuns.id, provider: promptRuns.provider, model: promptRuns.model })
			.from(promptRuns)
			.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
			.where(and(onPages(sql`${promptRuns}.ctid`, from, to), isNull(runExtractions.stamp)));
		if (runs.length === 0) return 0;
		const raw = await loadRawOutputs(
			conn,
			runs.map((run) => run.id),
		);
		await updateExtractions(
			conn,
			runs.map((run) => ({
				runId: run.id,
				textContent: tryExtractTextContent(raw.get(run.id), run.provider ?? run.model),
				stamp: LEGACY_EXTRACTION_STAMP,
			})),
			{ onlyUnstamped: true },
		);
		return runs.length;
	});
}
