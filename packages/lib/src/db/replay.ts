import { and, eq, isNotNull, sql } from "drizzle-orm";
import { EXTRACTION_KEY, MENTIONS_KEY } from "../analysis-versions";
import type { DbConnection } from "./db-connection";
import { brands } from "./schema";

/** Matches no real stamp, so every layer reads as stale. */
const REPLAY_REQUESTED = "replay-requested";

/**
 * Marks a brand's history stale, so the worker's next replay brings it up to date. For a prompt
 * enabled again: replays skip disabled prompts, so its answers may be judged under an old config.
 * The replay only re-derives runs whose own stamps are stale, so the rest of the brand costs nothing.
 */
export async function requestReplay(conn: DbConnection, brandId: string): Promise<void> {
	const stale = JSON.stringify({ [EXTRACTION_KEY]: REPLAY_REQUESTED, [MENTIONS_KEY]: REPLAY_REQUESTED });
	await conn
		.update(brands)
		.set({ analysisVersions: sql`${brands.analysisVersions} || ${stale}::jsonb` })
		// Unstamped brands are adopted at worker startup instead.
		.where(and(eq(brands.id, brandId), isNotNull(brands.analysisVersions)));
}
