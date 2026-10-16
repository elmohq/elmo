import { randomUUID } from "node:crypto";
import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { LEGACY_EXTRACTION_STAMP } from "../analysis-versions";
import type { RunMentionAssessments } from "../mentions";
import type { DbConnection } from "./db-connection";
import { type NewPromptRun, promptRuns, runExtractions, runMentions } from "./schema";

/**
 * Runs with what has been derived from them: the append-only `prompt_runs` row
 * joined to its extraction and mentions. A run not yet judged has no mentions
 * and is left out until it is. Chain `.where`, `.orderBy` and `.limit` as on any select.
 * Payloads are left out; read them with `loadRawOutputs`. Assessments come only with stored text:
 * their passage offsets index it, and mean nothing against text re-extracted on read.
 */
export function selectRuns(conn: DbConnection) {
	const { rawOutput, ...columns } = getTableColumns(promptRuns);
	return conn
		.select({
			...columns,
			textContent: runExtractions.textContent,
			brandMentioned: runMentions.brandMentioned,
			competitorsMentioned: runMentions.competitorsMentioned,
			mentionAssessments: sql<RunMentionAssessments | null>`CASE WHEN ${runExtractions.textContent} IS NULL THEN NULL ELSE ${runMentions.assessments} END`,
		})
		.from(promptRuns)
		.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id));
}

export interface NewRun extends Omit<NewPromptRun, "id"> {
	id?: string;
	textContent?: string | null;
	/** Absent for a run not yet judged: it gets its mentions from the judging job. */
	mentions?: RunMentionsRow;
	/** The stamp the text was extracted with; null leaves it to the next replay. */
	extractionStamp?: string | null;
}

export interface RunMentionsRow {
	brandMentioned: boolean;
	competitorsMentioned: string[];
	assessments: RunMentionAssessments | null;
	/** The `mentions` stamp they were derived with; null leaves them to the next replay. */
	stamp: string | null;
}

/** A run inserted without mentions is left out of every mention figure and rollup until it's judged. */
export async function insertRuns(conn: DbConnection, runs: NewRun[]): Promise<{ id: string; createdAt: Date }[]> {
	if (runs.length === 0) return [];
	const rows = runs.map((run) => ({ ...run, id: run.id ?? randomUUID() }));
	const saved = await conn
		.insert(promptRuns)
		.values(rows.map(({ textContent, mentions, extractionStamp, ...raw }) => raw))
		.returning({ id: promptRuns.id, createdAt: promptRuns.createdAt });
	await conn
		.insert(runExtractions)
		.values(
			rows.map((run) => ({ runId: run.id, textContent: run.textContent ?? null, stamp: run.extractionStamp ?? null })),
		);
	const judged = rows.flatMap((run) => (run.mentions ? [{ runId: run.id, ...run.mentions }] : []));
	if (judged.length > 0) await conn.insert(runMentions).values(judged);
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
 * Writes many runs' extractions in one statement, extracted for the first time or again:
 * derivation and backfills write in batches, and a statement per run is a round trip per run.
 * `onlyLegacyWithoutText` skips runs something else has extracted since they were read.
 */
export async function updateExtractions(
	conn: DbConnection,
	updates: ExtractionUpdate[],
	options: { onlyLegacyWithoutText?: boolean } = {},
): Promise<void> {
	if (updates.length === 0) return;
	const values = updates.map((u) => sql`(${u.runId}::uuid, ${u.textContent}::text, ${u.stamp}::text)`);
	await conn.execute(sql`
		INSERT INTO ${runExtractions} AS e (run_id, text_content, stamp)
		SELECT * FROM (VALUES ${sql.join(values, sql`, `)}) AS v(run_id, text_content, stamp)
		ON CONFLICT (run_id) DO UPDATE
		SET text_content = excluded.text_content, stamp = coalesce(excluded.stamp, e.stamp)
		${options.onlyLegacyWithoutText ? sql`WHERE e.text_content IS NULL AND (e.stamp IS NULL OR e.stamp = ${LEGACY_EXTRACTION_STAMP})` : sql``}
	`);
}

export interface MentionsUpdate {
	runId: string;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	assessments: RunMentionAssessments | null;
	stamp: string;
}

export async function updateMentions(conn: DbConnection, updates: MentionsUpdate[]): Promise<void> {
	if (updates.length === 0) return;
	const values = updates.map(
		(u) =>
			sql`(${u.runId}::uuid, ${u.brandMentioned}::boolean, ${sql.param(u.competitorsMentioned)}::text[], ${u.assessments === null ? null : JSON.stringify(u.assessments)}::jsonb, ${u.stamp}::text)`,
	);
	await conn.execute(sql`
		INSERT INTO ${runMentions} (run_id, brand_mentioned, competitors_mentioned, assessments, stamp)
		VALUES ${sql.join(values, sql`, `)}
		ON CONFLICT (run_id) DO UPDATE SET
			brand_mentioned = excluded.brand_mentioned, competitors_mentioned = excluded.competitors_mentioned,
			assessments = excluded.assessments, stamp = excluded.stamp
	`);
}
