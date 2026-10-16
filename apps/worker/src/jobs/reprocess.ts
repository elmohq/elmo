import { createHash } from "node:crypto";
import {
	type AnalysisVersions,
	currentAnalysisVersions,
	EXTRACTION_KEY,
	EXTRACTION_STAMP,
	MENTIONS_KEY,
	NAME_MATCHED_MENTIONS_STAMP,
} from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import {
	type Brand,
	brands,
	competitors,
	promptRuns,
	prompts,
	runExtractions,
	runMentions,
} from "@workspace/lib/db/schema";
import { type MentionConfig, mentionConfigFrom } from "@workspace/lib/mentions";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { and, eq, gte, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { getBoss } from "../boss";
import { type MentionAnalyzer, mentionAnalyzer } from "../mention-judge/analyze";
import { DERIVE_PRIORITY, reprocessDays, sendDeriveRuns } from "./derive-runs";

export const REPROCESS_QUEUE = "reprocess";

export type ReprocessLayer = "extraction" | "interpretation";

export interface ReprocessData {
	brandId: string;
	layers: ReprocessLayer[];
}

const LAYER_KEY: Record<ReprocessLayer, string> = { extraction: EXTRACTION_KEY, interpretation: MENTIONS_KEY };

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_FIRST_MS = 30 * DAY_MS;
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

const PROMPTS_PER_QUERY = 10;

async function queueStaleRuns(
	conn: DbConnection,
	boss: Pick<PgBoss, "insert">,
	brandId: string,
	layers: ReprocessLayer[],
	target: AnalysisVersions,
	days: number | null,
	brandPrompts: { id: string }[],
): Promise<number> {
	if (brandPrompts.length === 0) return 0;
	const now = Date.now();
	const cutoff = new Date(now - RECENT_FIRST_MS);
	const oldest = days === null ? undefined : gte(promptRuns.createdAt, new Date(now - days * DAY_MS));
	let queued = 0;
	for (const [age, priority] of [
		[and(gte(promptRuns.createdAt, cutoff), oldest), DERIVE_PRIORITY.recent],
		[and(lt(promptRuns.createdAt, cutoff), oldest), DERIVE_PRIORITY.history],
	] as const) {
		// A few prompts at a time, each read once through its (prompt_id, created_at) index: paging a
		// large brand's runs in id order re-sorted all of them for every page, past the statement timeout.
		for (let i = 0; i < brandPrompts.length; i += PROMPTS_PER_QUERY) {
			const rows = await conn
				.select({ id: promptRuns.id })
				.from(promptRuns)
				.leftJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
				.leftJoin(runMentions, eq(runMentions.runId, promptRuns.id))
				.where(
					and(
						inArray(
							promptRuns.promptId,
							brandPrompts.slice(i, i + PROMPTS_PER_QUERY).map(({ id }) => id),
						),
						age,
						or(...layers.map((layer) => staleFor(layer, target))),
					),
				);
			await sendDeriveRuns(
				boss,
				brandId,
				rows.map(({ id }) => id),
				priority,
				{ reextract: layers.includes("extraction") },
			);
			queued += rows.length;
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

/** Which prompts a brand's last full pass covered: passes skip disabled prompts' runs. */
const PROMPTS_KEY = "prompts";

function promptsStamp(promptIds: string[]): string {
	return createHash("sha256")
		.update([...promptIds].sort().join(","))
		.digest("hex")
		.slice(0, 16);
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
 * Stamping the brand before its runs are derived is safe: each chunk derives under the config
 * current when it runs and writes only if that's still current.
 */
export async function runReprocess(
	data: ReprocessData,
	conn: DbConnection = db,
	boss: Pick<PgBoss, "insert"> = getBoss(),
	analyzer: MentionAnalyzer = mentionAnalyzer(),
	days: number | null = reprocessDays(),
): Promise<void> {
	const context = await loadBrand(conn, data.brandId, analyzer);
	if (!context) {
		console.log(`[reprocess] brand ${data.brandId} no longer exists, skipping`);
		return;
	}
	// Left stale, so enabling it again brings its history up to date then.
	if (!context.brand.enabled) {
		console.log(`[reprocess] brand ${data.brandId} is disabled, skipping`);
		return;
	}
	const brandPrompts = await conn
		.select({ id: prompts.id })
		.from(prompts)
		.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true)));
	// Stamped before queueing, so the per-minute check doesn't send a second pass for the same runs.
	// An edit or a prompt enabled meanwhile leaves the brand stale for another pass.
	const target = {
		...pickLayers(context.current, data.layers),
		[PROMPTS_KEY]: promptsStamp(brandPrompts.map(({ id }) => id)),
	};
	await conn
		.update(brands)
		.set({
			analysisVersions: sql`coalesce(${brands.analysisVersions}, '{}'::jsonb) || ${JSON.stringify(target)}::jsonb`,
		})
		.where(eq(brands.id, data.brandId));
	const queued = await queueStaleRuns(conn, boss, data.brandId, data.layers, context.current, days, brandPrompts);
	if (data.layers.includes("interpretation")) await recomputeSystemTags(conn, context.brand);
	console.log(`[reprocess] brand ${data.brandId}: queued ${queued} runs toward ${JSON.stringify(target)}`);
}

function byBrand<T extends { brandId: string }>(rows: T[]): Map<string, T[]> {
	const grouped = new Map<string, T[]>();
	for (const row of rows) grouped.set(row.brandId, [...(grouped.get(row.brandId) ?? []), row]);
	return grouped;
}

/**
 * Requests a pass for every brand whose history no longer matches its config or
 * today's code. Runs every minute, which is how a config edit reaches a pass, and
 * how a dropped job heals. A brand already waiting on a pass keeps that one.
 *
 * `everyBrand`, at startup, also sends a pass to brands already stamped current: a pass stamps the
 * brand before its runs are judged, so runs whose jobs ran out of retries (the judge was down) would
 * otherwise stay stale. The pass queues only those.
 */
export async function requestStaleReprocesses(
	conn: DbConnection = db,
	boss: Pick<PgBoss, "send"> = getBoss(),
	analyzer: MentionAnalyzer = mentionAnalyzer(),
	{ everyBrand = false } = {},
): Promise<number> {
	const [allBrands, allCompetitors, enabledPrompts] = await Promise.all([
		conn.select().from(brands),
		conn.select().from(competitors),
		conn.select({ id: prompts.id, brandId: prompts.brandId }).from(prompts).where(eq(prompts.enabled, true)),
	]);
	const competitorsByBrand = byBrand(allCompetitors);
	const promptsByBrand = byBrand(enabledPrompts);
	let requested = 0;
	for (const brand of allBrands) {
		// Not yet adopted at startup; its history is taken as is until then.
		if (brand.analysisVersions === null || !brand.enabled) continue;
		const current = currentAnalysisVersions(
			mentionConfigFrom(brand, competitorsByBrand.get(brand.id) ?? []),
			analyzer.judgeVersion,
		);
		const stale = staleLayers(brand.analysisVersions, current);
		// A prompt enabled since the last pass has runs that pass skipped, to judge now.
		const promptsMoved =
			brand.analysisVersions[PROMPTS_KEY] !== promptsStamp((promptsByBrand.get(brand.id) ?? []).map(({ id }) => id));
		const layers: ReprocessLayer[] = stale.length === 0 && (everyBrand || promptsMoved) ? ["interpretation"] : stale;
		const sent =
			layers.length > 0 &&
			(await sendReprocess(boss, { brandId: brand.id, layers }, { startAfterSeconds: SETTLE_SECONDS }));
		if (sent) requested++;
	}
	return requested;
}

/**
 * Brands that predate stamping adopt today's extraction stamp rather than re-extracting their
 * whole history on deploy. Their mentions were matched by name, so they're stale for the judge.
 */
export async function adoptCurrentStamps(conn: DbConnection = db): Promise<number> {
	const adopted = await conn
		.update(brands)
		.set({ analysisVersions: { [EXTRACTION_KEY]: EXTRACTION_STAMP, [MENTIONS_KEY]: NAME_MATCHED_MENTIONS_STAMP } })
		.where(isNull(brands.analysisVersions))
		.returning({ id: brands.id });
	return adopted.length;
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
