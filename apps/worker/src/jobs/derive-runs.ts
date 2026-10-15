/**
 * Brings recorded runs up to today's code and their brand's config: their extracted text and
 * citations, and their judged mentions. Every derivation goes through here, a new run as a chunk
 * of one and a brand's replayed history as many, so any worker takes any chunk and one brand's
 * history spreads across all of them. Apart from the provider call that recorded each run, so it
 * retries on its own and never asks a provider again; a run counts in no mention figure until
 * it's judged.
 */
import * as Sentry from "@sentry/node";
import {
	type AnalysisVersions,
	currentAnalysisVersions,
	EXTRACTION_KEY,
	MENTIONS_KEY,
} from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { loadRawOutputs, updateExtractions, updateMentions } from "@workspace/lib/db/runs";
import { brands, citations, competitors, promptRuns, runExtractions, runMentions } from "@workspace/lib/db/schema";
import { type MentionConfig, mentionConfigFrom, type RunMentionAssessments } from "@workspace/lib/mentions";
import { insertRunsCitations, markDirty } from "@workspace/lib/rollups";
import { type Citation, extractRun } from "@workspace/lib/text-extraction";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Job, PgBoss, QueueOptions } from "pg-boss";
import { getBoss } from "../boss";
import { type MentionAnalyzer, mentionAnalyzer, type RunMentions } from "../mention-judge/analyze";

export const DERIVE_RUNS_QUEUE = "derive-runs";

/** Retries on its own, apart from the provider call that recorded each run. */
export const DERIVE_RUNS_QUEUE_OPTIONS = {
	retryLimit: 5,
	retryDelay: 30,
	retryBackoff: true,
	expireInSeconds: 60 * 15,
} satisfies QueueOptions;

export interface DeriveRunsData {
	brandId: string;
	runIds: string[];
}

/** New answers first, then the last 30 days of history, which the dashboards show, then the rest. */
export const DERIVE_PRIORITY = { new: 2, recent: 1, history: 0 } as const;

/** Small enough that a failed chunk costs little to redo, large enough to keep the queue short. */
const CHUNK_SIZE = 50;

export async function sendDeriveRuns(
	boss: Pick<PgBoss, "insert">,
	brandId: string,
	runIds: string[],
	priority: number,
	chunkSize = CHUNK_SIZE,
): Promise<void> {
	const jobs = [];
	for (let i = 0; i < runIds.length; i += chunkSize) {
		jobs.push({ data: { brandId, runIds: runIds.slice(i, i + chunkSize) } satisfies DeriveRunsData, priority });
	}
	for (let i = 0; i < jobs.length; i += 1000) await boss.insert(DERIVE_RUNS_QUEUE, jobs.slice(i, i + 1000));
}

export interface StaleRun {
	id: string;
	promptId: string;
	createdAt: Date;
	model: string;
	provider: string | null;
	textContent: string | null;
	/** Loaded (through `loadRawOutputs`) only when the run's text has to be (re)extracted. */
	rawOutput: unknown;
	/** The stamps its derived rows carry, keyed like the brand's; none for mentions not yet judged. */
	stamps: AnalysisVersions;
	brandMentioned: boolean;
	competitorsMentioned: string[];
	assessments: RunMentionAssessments | null;
	citationCount: number;
}

export interface RunUpdate {
	/** A null `stamp` leaves the stored one alone: text filled in for matching, citations untouched. */
	extraction?: { textContent: string | null; stamp: string | null };
	mentions?: {
		brandMentioned: boolean;
		competitorsMentioned: string[];
		assessments: RunMentionAssessments | null;
		stamp: string;
	};
	/** Present only when extraction ran: the run's citations are replaced wholesale. */
	citations?: Citation[];
	/** What the stored payload no longer yields, so the run keeps what it has (see `deriveRunUpdate`). */
	kept: ("text" | "citations" | "mentions")[];
}

/**
 * Brings one run up to `target`. A run that predates stored text gets it filled in for mention
 * matching, but keeps its extraction stamp: its citations weren't re-extracted.
 *
 * A replay never replaces something with nothing. Payloads stored by older code may lack what
 * that code read at the time, so when the stored payload yields no text, no citations, or (for
 * want of text) no mentions where the run has some, the run keeps what it has and `kept` says so.
 * The stamp still moves, so the run isn't retried forever. A judge that fails throws.
 */
export async function deriveRunUpdate(
	run: StaleRun,
	target: AnalysisVersions,
	config: MentionConfig,
	analyzer: MentionAnalyzer,
): Promise<RunUpdate> {
	const update: RunUpdate = { kept: [] };
	const extract = run.stamps[EXTRACTION_KEY] !== target[EXTRACTION_KEY];
	const text = extract || run.textContent === null ? reextract(run, extract, target, update) : run.textContent;
	if (run.stamps[MENTIONS_KEY] !== target[MENTIONS_KEY]) {
		update.mentions = { ...(await rederiveMentions(run, text, config, analyzer, update)), stamp: target[MENTIONS_KEY] };
	}
	return update;
}

/** Fills `update.extraction` (and citations when `extract`), returning the text mentions should read. */
function reextract(run: StaleRun, extract: boolean, target: AnalysisVersions, update: RunUpdate): string | null {
	const extracted = extractRun(run.rawOutput, run.provider ?? run.model);
	const lostText = extracted.textContent === null && run.textContent !== null;
	if (lostText) update.kept.push("text");
	const text = lostText ? run.textContent : extracted.textContent;
	update.extraction = { textContent: text, stamp: extract ? target[EXTRACTION_KEY] : null };
	if (!extract) return text;
	if (extracted.citations.length === 0 && run.citationCount > 0) update.kept.push("citations");
	else update.citations = extracted.citations;
	return text;
}

async function rederiveMentions(
	run: StaleRun,
	text: string | null,
	config: MentionConfig,
	analyzer: MentionAnalyzer,
	update: RunUpdate,
): Promise<RunMentions> {
	if (text !== null || (!run.brandMentioned && run.competitorsMentioned.length === 0)) {
		// Verdicts can be kept only while the text they were judged on, and point into, is unchanged.
		const previous = text === run.textContent ? run.assessments : null;
		return analyzer.analyze(text, config, previous);
	}
	update.kept.push("mentions");
	const { brandMentioned, competitorsMentioned, assessments } = run;
	return { brandMentioned, competitorsMentioned, assessments };
}

async function loadRuns(conn: DbConnection, runIds: string[], target: AnalysisVersions): Promise<StaleRun[]> {
	const rows = await conn
		.select({
			id: promptRuns.id,
			promptId: promptRuns.promptId,
			createdAt: promptRuns.createdAt,
			model: promptRuns.model,
			provider: promptRuns.provider,
			textContent: runExtractions.textContent,
			extractionStamp: runExtractions.stamp,
			mentionsStamp: runMentions.stamp,
			brandMentioned: runMentions.brandMentioned,
			competitorsMentioned: runMentions.competitorsMentioned,
			assessments: runMentions.assessments,
			citationCount: sql<number>`(SELECT count(*) FROM ${citations} WHERE ${citations.promptRunId} = ${promptRuns.id})::int`,
		})
		.from(promptRuns)
		.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.leftJoin(runMentions, eq(runMentions.runId, promptRuns.id))
		.where(inArray(promptRuns.id, runIds));
	const needsRaw = rows.filter((row) => row.textContent === null || row.extractionStamp !== target[EXTRACTION_KEY]);
	const raw = await loadRawOutputs(
		conn,
		needsRaw.map((row) => row.id),
	);
	return rows.map(({ extractionStamp, mentionsStamp, brandMentioned, competitorsMentioned, ...run }) => ({
		...run,
		brandMentioned: brandMentioned ?? false,
		competitorsMentioned: competitorsMentioned ?? [],
		rawOutput: raw.get(run.id),
		stamps: {
			...(extractionStamp ? { [EXTRACTION_KEY]: extractionStamp } : {}),
			...(mentionsStamp ? { [MENTIONS_KEY]: mentionsStamp } : {}),
		},
	}));
}

async function loadTarget(conn: DbConnection, brandId: string, analyzer: MentionAnalyzer) {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	const config = mentionConfigFrom(brand, brandCompetitors);
	return { config, target: currentAnalysisVersions(config, analyzer.judgeVersion) };
}

/**
 * Writes the derived rows, a few statements per chunk: `prompt_runs` itself is append-only.
 * False, writing nothing, when the brand's config moved while the chunk was derived: those
 * verdicts would be stale on arrival.
 */
function writeUpdates(
	conn: DbConnection,
	brandId: string,
	target: AnalysisVersions,
	updates: { run: StaleRun; update: RunUpdate }[],
	analyzer: MentionAnalyzer,
): Promise<boolean> {
	const recited = updates.filter(({ update }) => update.citations);
	return conn.transaction(async (tx) => {
		const current = await loadTarget(tx, brandId, analyzer);
		if (current?.target[MENTIONS_KEY] !== target[MENTIONS_KEY]) return false;
		await updateExtractions(
			tx,
			updates.flatMap(({ run, update }) => (update.extraction ? [{ runId: run.id, ...update.extraction }] : [])),
		);
		await updateMentions(
			tx,
			updates.flatMap(({ run, update }) => (update.mentions ? [{ runId: run.id, ...update.mentions }] : [])),
		);
		if (recited.length > 0) {
			await tx.delete(citations).where(
				inArray(
					citations.promptRunId,
					recited.map(({ run }) => run.id),
				),
			);
			await insertRunsCitations(
				tx,
				recited.map(({ run, update }) => ({ run: { ...run, brandId }, citations: update.citations ?? [] })),
			);
		}
		await markDirty(
			tx,
			brandId,
			updates.map(({ run }) => run.createdAt),
		);
		return true;
	});
}

/**
 * Derives one chunk. A run the judge fails on doesn't hold up the others: it goes back to the
 * queue as its own job, which retries alone; a job of one run fails, so the queue retries it.
 */
export async function deriveRuns(
	data: DeriveRunsData,
	conn: DbConnection = db,
	boss: Pick<PgBoss, "insert"> = getBoss(),
	analyzer: MentionAnalyzer = mentionAnalyzer(),
): Promise<void> {
	const context = await loadTarget(conn, data.brandId, analyzer);
	if (!context) return;
	const runs = await loadRuns(conn, data.runIds, context.target);
	const updates: { run: StaleRun; update: RunUpdate }[] = [];
	const failed: string[] = [];
	for (const run of runs) {
		try {
			const update = await deriveRunUpdate(run, context.target, context.config, analyzer);
			if (update.extraction || update.mentions || update.citations) updates.push({ run, update });
		} catch (error) {
			if (data.runIds.length === 1) throw error;
			console.error(`[derive-runs] run ${run.id} failed; retrying it on its own:`, error);
			Sentry.captureException(error);
			failed.push(run.id);
		}
	}
	// A moved config leaves the brand stale, and the replay that follows queues these runs again.
	if (updates.length > 0 && !(await writeUpdates(conn, data.brandId, context.target, updates, analyzer))) return;
	const kept = updates.filter(({ update }) => update.kept.length > 0).length;
	if (kept > 0) console.warn(`[derive-runs] ${kept} runs kept data their stored payload no longer yields`);
	await sendDeriveRuns(boss, data.brandId, failed, DERIVE_PRIORITY.new, 1);
}

/** How far back the sweep looks for runs whose judging was lost or gave up. */
const SWEEP_DAYS = 30;
/** Younger runs are left to the job sent when they were recorded. */
const SWEEP_MIN_AGE_MS = 10 * 60 * 1000;
const SWEEP_LIMIT = 5000;

/**
 * Asks again for runs still unjudged: their job was lost between recording and sending, or ran
 * out of retries. Runs every few minutes, so judging recovers on its own once it can.
 */
export async function requestUnjudgedRuns(
	conn: DbConnection = db,
	boss: Pick<PgBoss, "insert"> = getBoss(),
): Promise<number> {
	const now = Date.now();
	const rows = await conn
		.select({ id: promptRuns.id, brandId: promptRuns.brandId })
		.from(promptRuns)
		.leftJoin(runMentions, eq(runMentions.runId, promptRuns.id))
		.where(
			and(
				isNull(runMentions.runId),
				gte(promptRuns.createdAt, new Date(now - SWEEP_DAYS * 24 * 60 * 60 * 1000)),
				lt(promptRuns.createdAt, new Date(now - SWEEP_MIN_AGE_MS)),
			),
		)
		.limit(SWEEP_LIMIT);
	const byBrand = new Map<string, string[]>();
	for (const row of rows) byBrand.set(row.brandId, [...(byBrand.get(row.brandId) ?? []), row.id]);
	for (const [brandId, runIds] of byBrand) await sendDeriveRuns(boss, brandId, runIds, DERIVE_PRIORITY.new);
	return rows.length;
}

export async function deriveRunsJob(jobs: Job<DeriveRunsData>[]): Promise<void> {
	for (const job of jobs) await deriveRuns(job.data);
}
