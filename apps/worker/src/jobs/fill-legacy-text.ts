import { LEGACY_EXTRACTION_STAMP } from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { type HeapWalkOptions, onPages, walkHeap } from "@workspace/lib/db/heap-walk";
import { loadRawOutputs, updateExtractions } from "@workspace/lib/db/runs";
import { promptRuns, runExtractions } from "@workspace/lib/db/schema";
import { extractorFor, tryExtractTextContent } from "@workspace/lib/text-extraction";
import { and, eq, isNull, or, sql } from "drizzle-orm";

/**
 * Stores text for runs that predate stored text, from their own payloads: what
 * their pages already extract on every view, so nothing visible changes. Their
 * citations and mentions stay as recorded, and the `legacy` stamp still reads as
 * stale to a real extraction replay. A legacy run whose text couldn't be read is
 * tried again, so a fixed extractor fills it in. Walks `prompt_runs` newest pages first (see
 * `walkHeap`); resumable, since filled runs leave the filter.
 */
export function fillLegacyText(
	conn: DbConnection = db,
	{ pagesPerStep = 50, ...walk }: HeapWalkOptions & { pagesPerStep?: number } = {},
): Promise<number> {
	return walkHeap(
		conn,
		promptRuns,
		pagesPerStep,
		async (from, to) => {
			const runs = await conn
				.select({ id: promptRuns.id, provider: promptRuns.provider, model: promptRuns.model })
				.from(promptRuns)
				.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
				.where(
					and(
						onPages(sql`${promptRuns}.ctid`, from, to),
						isNull(runExtractions.textContent),
						or(isNull(runExtractions.stamp), eq(runExtractions.stamp, LEGACY_EXTRACTION_STAMP)),
					),
				);
			if (runs.length === 0) return 0;
			const raw = await loadRawOutputs(
				conn,
				runs.map((run) => run.id),
			);
			await updateExtractions(
				conn,
				runs.map((run) => ({
					runId: run.id,
					textContent: tryExtractTextContent(raw.get(run.id), extractorFor(run)),
					stamp: LEGACY_EXTRACTION_STAMP,
				})),
				{ onlyLegacyWithoutText: true },
			);
			return runs.length;
		},
		walk,
	);
}
