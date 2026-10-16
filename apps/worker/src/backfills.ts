import {
	beginBackgroundMigration,
	finishBackgroundMigration,
	listFinishedBackgroundMigrations,
	recordBackgroundError,
	recordBackgroundProgress,
} from "@workspace/lib/db/background-migrations";
import { db } from "@workspace/lib/db/db";
import type { HeapWalkOptions, HeapWalkPosition } from "@workspace/lib/db/heap-walk";
import { resolveUnpagedCitations } from "@workspace/lib/rollups";
import { fillLegacyText } from "./jobs/fill-legacy-text";

const FIRST_RETRY_MS = 60_000;
const MAX_RETRY_MS = 30 * 60_000;

/** The database's own message: a failed batch's query error carries every row of it as parameters. */
function briefly(error: unknown): string {
	const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
	return (cause instanceof Error ? cause.message : String(cause)).slice(0, 500);
}

interface Backfill {
	name: string;
	run: (walk: HeapWalkOptions) => Promise<number>;
}

/** Data migrations that need application code; see `background_migrations`. */
const BACKFILLS: Backfill[] = [
	// Renamed when runs recorded as `direct` became readable, so databases that finished it run it again.
	{ name: "legacy-run-text-by-engine", run: (walk) => fillLegacyText(db, walk) },
	{ name: "legacy-citation-pages", run: (walk) => resolveUnpagedCitations(db, walk) },
];

/**
 * Runs one in the background until it finishes, recording where it has got to
 * after each step so a restart picks up there. An error (a statement timeout on
 * a busy database, say) is recorded and retried, backing off, rather than leaving
 * it stopped until the next restart.
 */
async function runUntilDone(backfill: Backfill): Promise<void> {
	for (let retryMs = FIRST_RETRY_MS; ; retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)) {
		try {
			const row = await beginBackgroundMigration(db, backfill.name);
			const total = await backfill.run({
				from: row.progress as HeapWalkPosition | null,
				onStep: (position, changed) => recordBackgroundProgress(db, backfill.name, position, changed),
			});
			await finishBackgroundMigration(db, backfill.name);
			console.log(`[background-migration] ${backfill.name} finished (${total} rows this run)`);
			return;
		} catch (error) {
			const message = briefly(error);
			console.error(`[background-migration] ${backfill.name} failed, retrying in ${retryMs / 60_000} min: ${message}`);
			await recordBackgroundError(db, backfill.name, message).catch(() => {});
			await new Promise((resolve) => setTimeout(resolve, retryMs));
		}
	}
}

/** Starts the ones this database hasn't finished, without waiting on them. */
export async function startBackfills(): Promise<void> {
	const finished = await listFinishedBackgroundMigrations(db);
	for (const backfill of BACKFILLS) {
		if (!finished.has(backfill.name)) void runUntilDone(backfill);
	}
}
