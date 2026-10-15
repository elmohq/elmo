import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { loadRawOutputs, updateExtractions } from "@workspace/lib/db/runs";
import { promptRuns, runExtractions } from "@workspace/lib/db/schema";
import { tryExtractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq, gt, isNull } from "drizzle-orm";

/** The extraction stamp of a run whose text was filled in but whose citations are as recorded. */
export const LEGACY_EXTRACTION_STAMP = "legacy";

const BATCH_SIZE = 500;

/**
 * Stores text for runs that predate stored text, from their own payloads: what
 * their pages already extract on every view, so nothing visible changes. Their
 * citations and mentions stay as recorded, and the `legacy` stamp still reads as
 * stale to a real extraction replay. Resumable: filled runs leave the filter.
 */
export async function fillLegacyText(conn: DbConnection = db): Promise<number> {
	let filled = 0;
	let after: string | null = null;
	for (;;) {
		const runs = await conn
			.select({ id: runExtractions.runId, provider: promptRuns.provider, model: promptRuns.model })
			.from(runExtractions)
			.innerJoin(promptRuns, eq(promptRuns.id, runExtractions.runId))
			.where(and(isNull(runExtractions.stamp), after ? gt(runExtractions.runId, after) : undefined))
			.orderBy(asc(runExtractions.runId))
			.limit(BATCH_SIZE);
		if (runs.length === 0) return filled;
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
		filled += runs.length;
		after = runs[runs.length - 1].id;
	}
}
