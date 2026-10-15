import {
	type AnalysisVersions,
	currentAnalysisVersions,
	EXTRACTION_KEY,
	MENTIONS_KEY,
} from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import {
	type Brand,
	brands,
	type Competitor,
	competitors,
	promptRuns,
	prompts,
	runExtractions,
	runMentions,
} from "@workspace/lib/db/schema";
import { type MentionConfig, mentionConfigFrom } from "@workspace/lib/mentions";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { and, asc, eq, gt, gte, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { getBoss } from "../boss";
import { type MentionAnalyzer, mentionAnalyzer } from "../mention-judge/analyze";
import { DERIVE_PRIORITY, sendDeriveRuns } from "./derive-runs";

export const REPROCESS_QUEUE = "reprocess";

export type ReprocessLayer = "extraction" | "interpretation";

export interface ReprocessData {
	brandId: string;
	layers: ReprocessLayer[];
}

const LAYER_KEY: Record<ReprocessLayer, string> = { extraction: EXTRACTION_KEY, interpretation: MENTIONS_KEY };

const RECENT_FIRST_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * How long a newly stale brand waits before its pass starts. Edits tend to come in bursts (adding
 * several competitors), and the pass reads the config when it starts, so one wait covers them all.
 */
const SETTLE_SECONDS = 60;

export const REQUEST_REPROCESSES_QUEUE = "request-reprocesses";

const STAMP_COLUMN: Record<ReprocessLayer, SQL> = {
	extraction: sql`${runExtractions.stamp}`,
	interpretation: sql`${runMentions.stamp}`,
};

/** Unjudged runs have no mentions stamp, which is distinct from every target. */
const staleFor = (layer: ReprocessLayer, target: AnalysisVersions): SQL =>
	sql`${STAMP_COLUMN[layer]} IS DISTINCT FROM ${target[LAYER_KEY[layer]]}`;

const PAGE_SIZE = 5000;

/**
 * Queues every run of the brand that's stale for `layers`, recent runs ahead of older history.
 * Pages by id, which is unique where creation times can tie.
 */
async function queueStaleRuns(
	conn: DbConnection,
	boss: Pick<PgBoss, "insert">,
	brandId: string,
	layers: ReprocessLayer[],
	target: AnalysisVersions,
): Promise<number> {
	const brandPrompts = await conn.select({ id: prompts.id }).from(prompts).where(eq(prompts.brandId, brandId));
	if (brandPrompts.length === 0) return 0;
	const cutoff = new Date(Date.now() - RECENT_FIRST_MS);
	let queued = 0;
	for (const [age, priority] of [
		[gte(promptRuns.createdAt, cutoff), DERIVE_PRIORITY.recent],
		[lt(promptRuns.createdAt, cutoff), DERIVE_PRIORITY.history],
	] as const) {
		let after: string | null = null;
		for (;;) {
			const rows: { id: string }[] = await conn
				.select({ id: promptRuns.id })
				.from(promptRuns)
				.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
				.leftJoin(runMentions, eq(runMentions.runId, promptRuns.id))
				.where(
					and(
						// By prompt, which the runs are indexed on; a brand-wide filter would scan every tenant's runs.
						inArray(
							promptRuns.promptId,
							brandPrompts.map(({ id }) => id),
						),
						age,
						after ? gt(promptRuns.id, after) : undefined,
						or(...layers.map((layer) => staleFor(layer, target))),
					),
				)
				.orderBy(asc(promptRuns.id))
				.limit(PAGE_SIZE);
			await sendDeriveRuns(
				boss,
				brandId,
				rows.map(({ id }) => id),
				priority,
			);
			queued += rows.length;
			if (rows.length < PAGE_SIZE) break;
			after = rows[rows.length - 1].id;
		}
	}
	return queued;
}

function sameTags(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

/** Prompt tags read the same brand config mentions do, so they're recomputed alongside. */
async function recomputeSystemTags(conn: DbConnection, brand: Brand): Promise<void> {
	const brandPrompts = await conn
		.select({ id: prompts.id, value: prompts.value, systemTags: prompts.systemTags })
		.from(prompts)
		.where(eq(prompts.brandId, brand.id));

	for (const prompt of brandPrompts) {
		const nextTags = computeSystemTags(prompt.value, brand.name, brand.website);
		if (sameTags(nextTags, prompt.systemTags)) continue;
		await conn.update(prompts).set({ systemTags: nextTags }).where(eq(prompts.id, prompt.id));
	}
}

/** Re-deriving text changes what mentions are found, so extraction always brings interpretation along. */
export function staleLayers(stored: AnalysisVersions, current: AnalysisVersions): ReprocessLayer[] {
	if (stored[EXTRACTION_KEY] !== current[EXTRACTION_KEY]) return ["extraction", "interpretation"];
	if (stored[MENTIONS_KEY] !== current[MENTIONS_KEY]) return ["interpretation"];
	return [];
}

function pickLayers(versions: AnalysisVersions, layers: ReprocessLayer[]): AnalysisVersions {
	return Object.fromEntries(layers.map((layer) => [LAYER_KEY[layer], versions[LAYER_KEY[layer]]]));
}

async function loadBrand(
	conn: DbConnection,
	brandId: string,
	analyzer: MentionAnalyzer,
): Promise<{ brand: Brand; config: MentionConfig; current: AnalysisVersions } | null> {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	const config = mentionConfigFrom(brand, brandCompetitors);
	return { brand, config, current: currentAnalysisVersions(config, analyzer.judgeVersion) };
}

/** Stately per brand: one job runs and at most one waits, so passes for a brand never interleave. */
export function sendReprocess(
	boss: Pick<PgBoss, "send">,
	data: ReprocessData,
	options: { startAfterSeconds?: number } = {},
): Promise<string | null> {
	return boss.send(REPROCESS_QUEUE, data, {
		singletonKey: data.brandId,
		...(options.startAfterSeconds ? { startAfter: options.startAfterSeconds } : {}),
	});
}

/**
 * Brings a brand's history up to its current config and today's code by queueing its stale runs
 * for the derivation workers, then stamping the brand. Stamping before they're done is safe: each
 * chunk derives under the config current when it runs and writes only if that's still current,
 * and a config that moves again leaves the brand stale for the next pass.
 */
export async function runReprocess(
	data: ReprocessData,
	conn: DbConnection = db,
	boss: Pick<PgBoss, "insert"> = getBoss(),
	analyzer: MentionAnalyzer = mentionAnalyzer(),
): Promise<void> {
	const context = await loadBrand(conn, data.brandId, analyzer);
	if (!context) {
		console.log(`[reprocess] brand ${data.brandId} no longer exists, skipping`);
		return;
	}
	const target = pickLayers(context.current, data.layers);
	const queued = await queueStaleRuns(conn, boss, data.brandId, data.layers, context.current);
	if (data.layers.includes("interpretation")) await recomputeSystemTags(conn, context.brand);
	await conn
		.update(brands)
		.set({
			analysisVersions: sql`coalesce(${brands.analysisVersions}, '{}'::jsonb) || ${JSON.stringify(target)}::jsonb`,
		})
		.where(eq(brands.id, data.brandId));
	console.log(`[reprocess] brand ${data.brandId}: queued ${queued} runs toward ${JSON.stringify(target)}`);
}

/**
 * Requests a pass for every brand whose history no longer matches its config or
 * today's code. Runs every minute, which is how a config edit reaches a pass, and
 * how a dropped job heals. A brand already waiting on a pass keeps that one.
 */
export async function requestStaleReprocesses(
	conn: DbConnection = db,
	boss: Pick<PgBoss, "send"> = getBoss(),
): Promise<number> {
	const [allBrands, allCompetitors] = await Promise.all([conn.select().from(brands), conn.select().from(competitors)]);
	const competitorsByBrand = new Map<string, Competitor[]>();
	for (const competitor of allCompetitors) {
		competitorsByBrand.set(competitor.brandId, [...(competitorsByBrand.get(competitor.brandId) ?? []), competitor]);
	}
	let requested = 0;
	for (const brand of allBrands) {
		// Not yet adopted at startup; its history is taken as is until then.
		if (brand.analysisVersions === null) continue;
		const current = currentAnalysisVersions(
			mentionConfigFrom(brand, competitorsByBrand.get(brand.id) ?? []),
			mentionAnalyzer().judgeVersion,
		);
		const layers = staleLayers(brand.analysisVersions, current);
		const sent =
			layers.length > 0 &&
			(await sendReprocess(boss, { brandId: brand.id, layers }, { startAfterSeconds: SETTLE_SECONDS }));
		if (sent) requested++;
	}
	return requested;
}

/**
 * Brands that predate stamping adopt today's extraction stamp rather than
 * re-extracting their whole history on deploy. Their mentions were
 * substring-matched, so they adopt that stamp too, and a worker with the judge
 * goes on to re-judge them.
 */
export async function adoptCurrentStamps(conn: DbConnection = db): Promise<number> {
	const unstamped = await conn.select().from(brands).where(isNull(brands.analysisVersions));
	let adopted = 0;
	for (const brand of unstamped) {
		const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brand.id));
		const updated = await conn
			.update(brands)
			.set({ analysisVersions: currentAnalysisVersions(mentionConfigFrom(brand, brandCompetitors), null) })
			.where(and(eq(brands.id, brand.id), isNull(brands.analysisVersions)))
			.returning({ id: brands.id });
		adopted += updated.length;
	}
	return adopted;
}

export async function requestReprocessesJob(): Promise<void> {
	const requested = await requestStaleReprocesses();
	if (requested > 0) console.log(`[reprocess] requested passes for ${requested} brands`);
}

export async function reprocessJob(jobs: Job<ReprocessData>[]): Promise<void> {
	for (const job of jobs) {
		await runReprocess(job.data);
	}
}
