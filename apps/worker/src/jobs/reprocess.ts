import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import {
	type Brand,
	brands,
	type Competitor,
	citations,
	competitors,
	promptRuns,
	prompts,
} from "@workspace/lib/db/schema";
import {
	analyzeRunMentions,
	MENTIONS_ANALYSIS_KEY,
	type MentionConfig,
	mentionConfigFrom,
	mentionsStamp,
} from "@workspace/lib/mentions";
import { getPipelineState, markDirty, REFRESH_ROLLUPS_QUEUE, REPROCESS_QUEUE } from "@workspace/lib/rollups";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { type Citation, EXTRACTOR_VERSION, extractRun, tryExtractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq, gte, inArray, type SQL, sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import boss from "../boss";

export type ReprocessLayer = "extraction" | "interpretation";

export interface ReprocessData {
	brandId: string;
	layers: ReprocessLayer[];
	after?: RunCursor | null;
}

/**
 * Keyset position inside a brand's runs, ordered by `(created_at, id)` so the
 * `(brand_id, created_at)` index serves every batch.
 */
export interface RunCursor {
	createdAt: string;
	id: string;
}

const BATCH_SIZE = 200;
const TIME_BUDGET_MS = 4 * 60 * 1000;

type BossSender = Pick<PgBoss, "send">;

interface StoredRun {
	id: string;
	promptId: string;
	createdAt: Date;
	model: string;
	provider: string | null;
	textContent: string | null;
	extractorVersion: number | null;
	analysisVersions: Record<string, string>;
}

export interface BrandMentions {
	config: MentionConfig;
	stamp: string;
}

export interface RowWork {
	extraction: boolean;
	mentions: boolean;
}

function planRow(row: StoredRun, data: Pick<ReprocessData, "layers">, mentions: BrandMentions): RowWork {
	return {
		extraction: data.layers.includes("extraction") && row.extractorVersion !== EXTRACTOR_VERSION,
		mentions: data.layers.includes("interpretation") && row.analysisVersions[MENTIONS_ANALYSIS_KEY] !== mentions.stamp,
	};
}

const needsRaw = (row: StoredRun, work: RowWork) => work.extraction || (work.mentions && row.textContent === null);

interface RowColumns {
	textContent?: string | null;
	extractorVersion?: number;
	brandMentioned?: boolean;
	competitorsMentioned?: string[];
	analysisVersions?: SQL;
}

interface RowUpdate {
	columns: RowColumns;
	/** Present only when extraction ran: the run's citations are replaced wholesale. */
	citations?: Citation[];
}

/** `raw` is undefined when the row's plan didn't need it fetched. */
export function buildRowUpdate(
	row: StoredRun,
	work: RowWork,
	raw: unknown | undefined,
	mentions: BrandMentions,
): RowUpdate | null {
	const columns: RowColumns = {};
	let citations: Citation[] | undefined;
	let text = row.textContent;

	if (work.extraction && raw !== undefined) {
		const extracted = extractRun(raw, row.provider ?? row.model);
		columns.textContent = extracted.textContent;
		columns.extractorVersion = EXTRACTOR_VERSION;
		citations = extracted.citations;
		text = extracted.textContent;
	} else if (work.mentions && raw !== undefined && row.textContent === null) {
		// The extractor stamp stays as it was: citations weren't re-extracted, so
		// an extraction pass must still treat the row as stale.
		columns.textContent = tryExtractTextContent(raw, row.provider ?? row.model);
		text = columns.textContent;
	}

	if (work.mentions) {
		Object.assign(columns, analyzeRunMentions(text, mentions.config));
		columns.analysisVersions = sql`${promptRuns.analysisVersions} || ${JSON.stringify({ [MENTIONS_ANALYSIS_KEY]: mentions.stamp })}::jsonb`;
	}

	if (Object.keys(columns).length === 0) return null;
	return { columns, citations };
}

async function loadRunBatch(conn: DbConnection, brandId: string, after: RunCursor | null): Promise<StoredRun[]> {
	return conn
		.select({
			id: promptRuns.id,
			promptId: promptRuns.promptId,
			createdAt: promptRuns.createdAt,
			model: promptRuns.model,
			provider: promptRuns.provider,
			textContent: promptRuns.textContent,
			extractorVersion: promptRuns.extractorVersion,
			analysisVersions: promptRuns.analysisVersions,
		})
		.from(promptRuns)
		.where(
			and(
				eq(promptRuns.brandId, brandId),
				after
					? sql`(${promptRuns.createdAt}, ${promptRuns.id}) > (${after.createdAt}::timestamptz, ${after.id}::uuid)`
					: undefined,
			),
		)
		.orderBy(asc(promptRuns.createdAt), asc(promptRuns.id))
		.limit(BATCH_SIZE);
}

async function loadRawMap(conn: DbConnection, ids: string[]): Promise<Map<string, unknown>> {
	if (ids.length === 0) return new Map();
	const rows = await conn
		.select({ id: promptRuns.id, rawOutput: promptRuns.rawOutput })
		.from(promptRuns)
		.where(inArray(promptRuns.id, ids));
	return new Map(rows.map((row) => [row.id, row.rawOutput]));
}

async function replaceCitations(
	tx: DbConnection,
	row: StoredRun,
	brandId: string,
	extracted: Citation[],
): Promise<void> {
	await tx.delete(citations).where(eq(citations.promptRunId, row.id));
	if (extracted.length === 0) return;
	await tx.insert(citations).values(
		extracted.map((c) => ({
			promptRunId: row.id,
			promptId: row.promptId,
			brandId,
			model: row.model,
			url: c.url,
			domain: c.domain,
			title: c.title || null,
			citationIndex: c.citationIndex,
			createdAt: row.createdAt,
		})),
	);
}

async function processBatch(
	conn: DbConnection,
	brandId: string,
	mentions: BrandMentions,
	rows: { row: StoredRun; work: RowWork }[],
	rawById: Map<string, unknown>,
): Promise<number> {
	return conn.transaction(async (tx) => {
		const touched: Date[] = [];
		for (const { row, work } of rows) {
			const update = buildRowUpdate(row, work, rawById.get(row.id), mentions);
			if (!update) continue;
			await tx.update(promptRuns).set(update.columns).where(eq(promptRuns.id, row.id));
			if (update.citations) await replaceCitations(tx, row, brandId, update.citations);
			touched.push(row.createdAt);
		}
		await markDirty(tx, brandId, touched, "reprocess");
		return touched.length;
	});
}

interface BrandProcessResult {
	processed: number;
	rewritten: number;
	timedOut: boolean;
	last: RunCursor | null;
}

async function processRunsForBrand(
	conn: DbConnection,
	brandId: string,
	mentions: BrandMentions,
	data: ReprocessData,
	startAfter: RunCursor | null,
	deadline: number,
): Promise<BrandProcessResult> {
	let after = startAfter;
	let processed = 0;
	let rewritten = 0;

	for (;;) {
		if (Date.now() > deadline) return { processed, rewritten, timedOut: true, last: after };
		const rows = await loadRunBatch(conn, brandId, after);
		if (rows.length === 0) break;

		const planned = rows.map((row) => ({ row, work: planRow(row, data, mentions) }));
		const rawById = await loadRawMap(
			conn,
			planned.filter(({ row, work }) => needsRaw(row, work)).map(({ row }) => row.id),
		);

		processed += rows.length;
		rewritten += await processBatch(conn, brandId, mentions, planned, rawById);
		const lastRow = rows[rows.length - 1];
		after = { createdAt: lastRow.createdAt.toISOString(), id: lastRow.id };
	}
	return { processed, rewritten, timedOut: false, last: after };
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

const EXTRACTION_ANALYSIS_KEY = "extraction";

/** The stamps a brand's whole run history should carry under today's code and config. */
export function brandVersions(config: MentionConfig): Record<string, string> {
	return { [EXTRACTION_ANALYSIS_KEY]: String(EXTRACTOR_VERSION), [MENTIONS_ANALYSIS_KEY]: mentionsStamp(config) };
}

/** Re-deriving text changes what mentions are found, so extraction always brings interpretation along. */
export function staleLayers(stored: Record<string, string>, current: Record<string, string>): ReprocessLayer[] {
	if (stored[EXTRACTION_ANALYSIS_KEY] !== current[EXTRACTION_ANALYSIS_KEY]) return ["extraction", "interpretation"];
	if (stored[MENTIONS_ANALYSIS_KEY] !== current[MENTIONS_ANALYSIS_KEY]) return ["interpretation"];
	return [];
}

async function loadBrand(
	conn: DbConnection,
	brandId: string,
): Promise<{ brand: Brand; mentions: BrandMentions } | null> {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	const config = mentionConfigFrom(brand, brandCompetitors);
	return { brand, mentions: { config, stamp: mentionsStamp(config) } };
}

/**
 * Stately per brand: one job runs and at most one waits, so jobs for a brand
 * never interleave, and a config edit during a run is picked up by the waiting
 * job, which reads the config when it starts.
 */
export function sendReprocess(sendBoss: BossSender, data: ReprocessData): Promise<string | null> {
	return sendBoss.send(REPROCESS_QUEUE, data, { singletonKey: data.brandId });
}

async function triggerRefresh(sendBoss: BossSender): Promise<void> {
	try {
		await sendBoss.send(
			REFRESH_ROLLUPS_QUEUE,
			{ source: "reprocess" },
			{ singletonKey: REFRESH_ROLLUPS_QUEUE, singletonSeconds: 10 },
		);
	} catch (error) {
		console.error("[reprocess] failed to send refresh-rollups trigger:", error);
	}
}

export async function runReprocess(
	data: ReprocessData,
	conn: DbConnection = db,
	sendBoss: BossSender = boss,
): Promise<void> {
	const deadline = Date.now() + TIME_BUDGET_MS;
	const context = await loadBrand(conn, data.brandId);
	if (!context) {
		console.log(`[reprocess] brand ${data.brandId} no longer exists, skipping`);
		return;
	}

	const result = await processRunsForBrand(conn, data.brandId, context.mentions, data, data.after ?? null, deadline);
	console.log(
		`[reprocess] brand ${data.brandId} processed=${result.processed} rewritten=${result.rewritten} timedOut=${result.timedOut}`,
	);
	if (result.timedOut) {
		await sendReprocess(sendBoss, { ...data, after: result.last });
		return;
	}

	if (data.layers.includes("interpretation")) await recomputeSystemTags(conn, context.brand);
	const done = pickLayers(brandVersions(context.mentions.config), data.layers);
	await conn
		.update(brands)
		.set({ analysisVersions: sql`${brands.analysisVersions} || ${JSON.stringify(done)}::jsonb` })
		.where(eq(brands.id, data.brandId));
	await triggerRefresh(sendBoss);
}

function pickLayers(versions: Record<string, string>, layers: ReprocessLayer[]): Record<string, string> {
	return Object.fromEntries(
		Object.entries(versions).filter(([key]) =>
			key === EXTRACTION_ANALYSIS_KEY ? layers.includes("extraction") : layers.includes("interpretation"),
		),
	);
}

/**
 * Finds brands whose history no longer matches their current config or today's
 * code and requests a reprocess for each, so a missed config-change hook or a
 * dropped job heals on the next pass. Brands that predate the rollups adopt
 * today's stamps: their history is taken as is until something changes.
 */
export async function requestStaleReprocesses(conn: DbConnection = db, sendBoss: BossSender = boss): Promise<number> {
	const [state, allBrands, allCompetitors] = await Promise.all([
		getPipelineState(conn),
		conn.select().from(brands),
		conn.select().from(competitors),
	]);
	const competitorsByBrand = new Map<string, Competitor[]>();
	for (const competitor of allCompetitors) {
		competitorsByBrand.set(competitor.brandId, [...(competitorsByBrand.get(competitor.brandId) ?? []), competitor]);
	}

	let requested = 0;
	for (const brand of allBrands) {
		const current = brandVersions(mentionConfigFrom(brand, competitorsByBrand.get(brand.id) ?? []));
		const predatesRollups = state.backfillEnqueuedAt !== null && brand.createdAt < state.backfillEnqueuedAt;
		if (predatesRollups && Object.keys(brand.analysisVersions).length === 0) {
			await conn.update(brands).set({ analysisVersions: current }).where(eq(brands.id, brand.id));
			continue;
		}
		const layers = staleLayers(brand.analysisVersions, current);
		if (layers.length === 0) continue;
		await sendReprocess(sendBoss, { brandId: brand.id, layers });
		requested++;
	}
	return requested;
}

export async function reprocessJob(jobs: Job<ReprocessData>[]): Promise<void> {
	for (const job of jobs) {
		await runReprocess(job.data);
	}
}
