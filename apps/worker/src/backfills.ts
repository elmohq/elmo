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

const RETRY_DELAY_MS = 60_000;

interface Backfill {
	name: string;
	run: (walk: HeapWalkOptions) => Promise<number>;
}

/** Data migrations that need application code; see `background_migrations`. */
const BACKFILLS: Backfill[] = [
	{ name: "legacy-run-text", run: (walk) => fillLegacyText(db, walk) },
	{ name: "legacy-citation-pages", run: (walk) => resolveUnpagedCitations(db, walk) },
];

/**
 * Runs one in the background until it finishes, recording where it has got to
 * after each step so a restart picks up there. An error (a statement timeout on
 * a busy database, say) is recorded and retried rather than leaving it stopped
 * until the next restart.
 */
async function runUntilDone(backfill: Backfill): Promise<void> {
	for (;;) {
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
			console.error(`[background-migration] ${backfill.name} failed; retrying in a minute:`, error);
			await recordBackgroundError(db, backfill.name, String(error)).catch(() => {});
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
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
