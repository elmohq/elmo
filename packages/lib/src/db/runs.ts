import { randomUUID } from "node:crypto";
import { eq, getTableColumns, inArray } from "drizzle-orm";
import type { DbConnection } from "./db-connection";
import { type NewPromptRun, promptRuns, runExtractions, runMentions } from "./schema";

/**
 * Runs with what has been derived from them: the append-only `prompt_runs` row
 * joined to its extraction and mentions. Every run has both, so inner joins
 * lose nothing. Chain `.where`, `.orderBy` and `.limit` as on any select.
 */
export function selectRuns(conn: DbConnection) {
	return conn
		.select({
			...getTableColumns(promptRuns),
			textContent: runExtractions.textContent,
			brandMentioned: runMentions.brandMentioned,
			competitorsMentioned: runMentions.competitorsMentioned,
		})
		.from(promptRuns)
		.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id));
}

export type RunWithDerived = Awaited<ReturnType<typeof selectRuns>>[number];

export interface NewRun extends Omit<NewPromptRun, "id"> {
	id?: string;
	textContent?: string | null;
	brandMentioned: boolean;
	competitorsMentioned?: string[];
	/** The stamps the derived values were computed with; null leaves them to the next replay. */
	extractionStamp?: string | null;
	mentionsStamp?: string | null;
}

/** Writes runs with their derived rows. The one way a run enters the database, so none lacks either. */
export async function insertRuns(conn: DbConnection, runs: NewRun[]): Promise<{ id: string; createdAt: Date }[]> {
	if (runs.length === 0) return [];
	const rows = runs.map((run) => ({ ...run, id: run.id ?? randomUUID() }));
	const saved = await conn
		.insert(promptRuns)
		.values(
			rows.map(({ textContent, brandMentioned, competitorsMentioned, extractionStamp, mentionsStamp, ...raw }) => raw),
		)
		.returning({ id: promptRuns.id, createdAt: promptRuns.createdAt });
	await conn
		.insert(runExtractions)
		.values(
			rows.map((run) => ({ runId: run.id, textContent: run.textContent ?? null, stamp: run.extractionStamp ?? null })),
		);
	await conn.insert(runMentions).values(
		rows.map((run) => ({
			runId: run.id,
			brandMentioned: run.brandMentioned,
			competitorsMentioned: run.competitorsMentioned ?? [],
			stamp: run.mentionsStamp ?? null,
		})),
	);
	const byId = new Map(saved.map((row) => [row.id, row]));
	return rows.map((run) => byId.get(run.id) as { id: string; createdAt: Date });
}

/**
 * Runs' raw provider payloads, keyed by run id. Replay reads payloads only
 * through here, so moving `raw_output` to an object store is a change to this
 * function rather than to its callers.
 */
export async function loadRawOutputs(conn: DbConnection, runIds: string[]): Promise<Map<string, unknown>> {
	if (runIds.length === 0) return new Map();
	const rows = await conn
		.select({ id: promptRuns.id, rawOutput: promptRuns.rawOutput })
		.from(promptRuns)
		.where(inArray(promptRuns.id, runIds));
	return new Map(rows.map((row) => [row.id, row.rawOutput]));
}
