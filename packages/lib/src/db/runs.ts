import { randomUUID } from "node:crypto";
import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { RunMentionAssessments } from "../mentions";
import type { DbConnection } from "./db-connection";
import { type NewPromptRun, promptRuns, runExtractions, runMentions } from "./schema";

/**
 * Runs with what has been derived from them: the append-only `prompt_runs` row
 * joined to its extraction and mentions. Every run has both, so inner joins
 * lose nothing. Chain `.where`, `.orderBy` and `.limit` as on any select.
 * Payloads are left out; read them with `loadRawOutputs`.
 */
export function selectRuns(conn: DbConnection) {
	const { rawOutput, ...columns } = getTableColumns(promptRuns);
	return conn
		.select({
			...columns,
			textContent: runExtractions.textContent,
			brandMentioned: runMentions.brandMentioned,
			competitorsMentioned: runMentions.competitorsMentioned,
			mentionAssessments: runMentions.assessments,
		})
		.from(promptRuns)
		.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id));
}

export interface NewRun extends Omit<NewPromptRun, "id"> {
	id?: string;
	textContent?: string | null;
	brandMentioned: boolean;
	competitorsMentioned?: string[];
	assessments?: RunMentionAssessments | null;
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
			rows.map(
				({ textContent, brandMentioned, competitorsMentioned, assessments, extractionStamp, mentionsStamp, ...raw }) =>
					raw,
			),
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
			assessments: run.assessments ?? null,
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

export interface ExtractionUpdate {
	runId: string;
	textContent: string | null;
	/** Null leaves the stored stamp alone. */
	stamp: string | null;
}

/**
 * Rewrites many runs' extractions in one statement: backfills and replays write
 * in batches, and a statement per run is a round trip per run. `onlyUnstamped`
 * skips runs something else has stamped since they were read.
 */
export async function updateExtractions(
	conn: DbConnection,
	updates: ExtractionUpdate[],
	options: { onlyUnstamped?: boolean } = {},
): Promise<void> {
	if (updates.length === 0) return;
	const values = updates.map((u) => sql`(${u.runId}::uuid, ${u.textContent}::text, ${u.stamp}::text)`);
	await conn.execute(sql`
		UPDATE ${runExtractions} AS e
		SET text_content = v.text_content, stamp = coalesce(v.stamp, e.stamp)
		FROM (VALUES ${sql.join(values, sql`, `)}) AS v(run_id, text_content, stamp)
		WHERE e.run_id = v.run_id ${options.onlyUnstamped ? sql`AND e.stamp IS NULL` : sql``}
	`);
}

export interface MentionsUpdate {
	runId: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	assessments: RunMentionAssessments | null;
	stamp: string;
}

/** Rewrites many runs' mentions in one statement; see `updateExtractions`. */
export async function updateMentions(conn: DbConnection, updates: MentionsUpdate[]): Promise<void> {
	if (updates.length === 0) return;
	const values = updates.map(
		(u) =>
			sql`(${u.runId}::uuid, ${u.brandMentioned}::boolean, ${sql.param(u.competitorsMentioned)}::text[], ${u.assessments === null ? null : JSON.stringify(u.assessments)}::jsonb, ${u.stamp}::text)`,
	);
	await conn.execute(sql`
		UPDATE ${runMentions} AS m
		SET brand_mentioned = v.brand_mentioned, competitors_mentioned = v.competitors_mentioned,
			assessments = v.assessments, stamp = v.stamp
		FROM (VALUES ${sql.join(values, sql`, `)}) AS v(run_id, brand_mentioned, competitors_mentioned, assessments, stamp)
		WHERE m.run_id = v.run_id
	`);
}
