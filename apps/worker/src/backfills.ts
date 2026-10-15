import { db } from "@workspace/lib/db/db";
import { getPipelineState, recordBackfillDone, resolveUnpagedCitations } from "@workspace/lib/rollups";
import { fillLegacyText } from "./jobs/fill-legacy-text";

const RETRY_DELAY_MS = 60_000;

interface Backfill {
	name: string;
	run: () => Promise<number>;
	done: (count: number) => string;
}

const BACKFILLS: Backfill[] = [
	{ name: "legacy-text", run: () => fillLegacyText(db), done: (n) => `filled stored text for ${n} older runs` },
	{
		name: "legacy-citation-pages",
		run: () => resolveUnpagedCitations(db),
		done: (n) => `resolved pages for ${n} older citations`,
	},
];

/**
 * Runs one in the background until it finishes. Each is resumable, so an error
 * (a statement timeout on a busy database, say) is retried rather than leaving it
 * half done until the next restart. Once finished it's recorded, so later starts
 * don't walk the whole table to find nothing to do.
 */
async function runUntilDone(backfill: Backfill): Promise<void> {
	for (;;) {
		try {
			const count = await backfill.run();
			await recordBackfillDone(db, backfill.name);
			console.log(`[backfill] ${backfill.name}: ${backfill.done(count)}`);
			return;
		} catch (error) {
			console.error(`[backfill] ${backfill.name} failed; retrying in a minute:`, error);
			await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
		}
	}
}

/** Starts the backfills this database hasn't finished, without waiting on them. */
export async function startBackfills(): Promise<void> {
	const { completedBackfills } = await getPipelineState(db);
	for (const backfill of BACKFILLS) {
		if (!completedBackfills.includes(backfill.name)) void runUntilDone(backfill);
	}
}
