/**
 * Judges recorded answers: whether each mentions the brand and its competitors, and the sentiment
 * and position of each. Apart from the provider call that recorded the answer, so judging retries
 * on its own and never asks a provider again; an answer counts in no mention figure until it's judged.
 */
import { currentAnalysisVersions, MENTIONS_KEY } from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { brands, competitors, promptRuns, runExtractions, runMentions } from "@workspace/lib/db/schema";
import { type MentionConfig, mentionConfigFrom } from "@workspace/lib/mentions";
import { markDirty } from "@workspace/lib/rollups";
import { and, eq, gte, isNull, lt } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { getBoss } from "../boss";
import { type MentionAnalyzer, mentionAnalyzer } from "../mention-judge/analyze";

export const JUDGE_RUNS_QUEUE = "judge-runs";

export interface JudgeRunData {
	runId: string;
}

/** Stately per run, so a run waits in the queue at most once however often it's asked for. */
export async function sendJudgeRuns(boss: Pick<PgBoss, "insert">, runIds: string[]): Promise<void> {
	if (runIds.length === 0) return;
	await boss.insert(
		JUDGE_RUNS_QUEUE,
		runIds.map((runId) => ({ data: { runId } satisfies JudgeRunData, singletonKey: runId })),
	);
}

export async function loadMentionConfig(conn: DbConnection, brandId: string): Promise<MentionConfig> {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId));
	const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	return mentionConfigFrom(brand, brandCompetitors);
}

/**
 * Brings one run's mentions up to its brand's current config. Judging takes too long to hold a
 * transaction open for, so it runs first; an edit that lands meanwhile is caught in the
 * transaction, where only the subjects it changed are judged again.
 */
export async function judgeRun(runId: string, conn: DbConnection = db, analyzer: MentionAnalyzer = mentionAnalyzer()) {
	const [run] = await conn
		.select({
			brandId: promptRuns.brandId,
			createdAt: promptRuns.createdAt,
			text: runExtractions.textContent,
			assessments: runMentions.assessments,
			stamp: runMentions.stamp,
		})
		.from(promptRuns)
		.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.leftJoin(runMentions, eq(runMentions.runId, promptRuns.id))
		.where(eq(promptRuns.id, runId))
		.limit(1);
	if (!run) return;
	const config = await loadMentionConfig(conn, run.brandId);
	const judgedStamp = currentAnalysisVersions(config, analyzer.judgeVersion)[MENTIONS_KEY];
	if (run.stamp === judgedStamp) return;
	let { assessments, ...mentions } = await analyzer.analyze(run.text, config, run.assessments);
	await conn.transaction(async (tx) => {
		const current = await loadMentionConfig(tx, run.brandId);
		const stamp = currentAnalysisVersions(current, analyzer.judgeVersion)[MENTIONS_KEY];
		if (stamp !== judgedStamp) ({ assessments, ...mentions } = await analyzer.analyze(run.text, current, assessments));
		const row = { ...mentions, assessments, stamp };
		await tx
			.insert(runMentions)
			.values({ runId, ...row })
			.onConflictDoUpdate({ target: runMentions.runId, set: row });
		await markDirty(tx, run.brandId, [run.createdAt]);
	});
}

/** How far back the sweep looks for runs whose judging job was lost or gave up. */
const SWEEP_DAYS = 30;
/** Younger runs are left to the job sent when they were recorded. */
const SWEEP_MIN_AGE_MS = 10 * 60 * 1000;
const SWEEP_LIMIT = 5000;

/**
 * Asks again for runs that are still unjudged: their job was lost between recording and sending,
 * or ran out of retries. Runs every few minutes, so judging recovers on its own once it can.
 */
export async function requestUnjudgedRuns(
	conn: DbConnection = db,
	boss: Pick<PgBoss, "insert"> = getBoss(),
): Promise<number> {
	const now = Date.now();
	const rows = await conn
		.select({ id: promptRuns.id })
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
	await sendJudgeRuns(
		boss,
		rows.map((row) => row.id),
	);
	return rows.length;
}

export async function judgeRunsJob(jobs: Job<JudgeRunData>[]): Promise<void> {
	for (const job of jobs) await judgeRun(job.data.runId);
}
