import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { type Brand, brands, citations, competitors, promptRuns, prompts } from "@workspace/lib/db/schema";
import {
	type BrandContext,
	brandContextFrom,
	DERIVERS,
	type Deriver,
	type DeriverInput,
	deriveAll,
	planRowWork,
	type RowWorkPlan,
	staleDerivers,
} from "@workspace/lib/derivers";
import { inTransaction, markDirtyForTimestamps, REFRESH_ROLLUPS_QUEUE, REPROCESS_QUEUE } from "@workspace/lib/rollups";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { type Citation, EXTRACTOR_VERSION, extractRun, tryExtractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq, gt, gte, inArray, type SQL, sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import boss from "../boss";

export interface ReprocessData {
	/** Omitted = every brand. */
	brandId?: string;
	layers: ("extraction" | "interpretation")[];
	/** Restrict interpretation to these deriver names; omitted = all of DERIVERS. */
	derivers?: string[];
	cursor?: { brandId: string; lastRunId: string | null };
}

const BATCH_SIZE = 200;
const TIME_BUDGET_MS = 4 * 60 * 1000;

/**
 * A pg-boss client narrowed to the one method this job needs, so a test can
 * pass a stub that records calls instead of a live queue.
 */
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

interface RowPlan {
	row: StoredRun;
	stale: Deriver[];
	plan: RowWorkPlan;
}

function planRow(
	row: StoredRun,
	ctx: BrandContext,
	data: Pick<ReprocessData, "layers" | "derivers">,
	derivers: readonly Deriver[] = DERIVERS,
): RowPlan {
	const extractionRequested = data.layers.includes("extraction");
	const stale = data.layers.includes("interpretation")
		? staleDerivers(row.analysisVersions, ctx, derivers, data.derivers)
		: [];
	const plan = planRowWork(row, extractionRequested, EXTRACTOR_VERSION, stale);
	return { row, stale, plan };
}

interface RowColumns {
	textContent?: string | null;
	extractorVersion?: number;
	brandMentioned?: boolean;
	competitorsMentioned?: string[];
	analysisVersions?: SQL;
}

interface RowUpdate {
	columns: RowColumns;
	/** Present only when extraction ran: the run's citations must be replaced wholesale. */
	citations?: Citation[];
}

/**
 * Applies extraction and/or interpretation to one row's stale plan. Pure and
 * DB-free: `raw` is whatever the caller already fetched (or `undefined` when it
 * decided this row does not need it), so this is unit-testable without a
 * database or a real run.
 */
export function buildRowUpdate(rowPlan: RowPlan, raw: unknown | undefined, ctx: BrandContext): RowUpdate | null {
	const { row, stale, plan } = rowPlan;
	if (!plan.needsExtraction && stale.length === 0) return null;

	const columns: RowColumns = {};
	let citations: Citation[] | undefined;
	let textForDerive = row.textContent;

	if (plan.needsExtraction && raw !== undefined) {
		const extracted = extractRun(raw, row.provider ?? row.model);
		columns.textContent = extracted.textContent;
		columns.extractorVersion = EXTRACTOR_VERSION;
		citations = extracted.citations;
		textForDerive = extracted.textContent;
	} else if (raw !== undefined && row.textContent === null && stale.some((deriver) => deriver.needs === "text")) {
		// Piggyback on a raw fetch that interpretation already needed to fill the
		// missing text. The extractor stamp stays as it was: the row's citations
		// were not re-extracted, so an extraction pass must still treat it as stale.
		columns.textContent = tryExtractTextContent(raw, row.provider ?? row.model);
		textForDerive = columns.textContent;
	}

	if (stale.length > 0) {
		const input: DeriverInput = {
			textContent: textForDerive,
			rawOutput: raw ?? null,
			provider: row.provider,
			model: row.model,
		};
		const { columns: derived, versions } = deriveAll(input, ctx, stale);
		Object.assign(columns, derived);
		columns.analysisVersions = sql`${promptRuns.analysisVersions} || ${JSON.stringify(versions)}::jsonb`;
	}

	if (Object.keys(columns).length === 0 && citations === undefined) return null;
	return { columns, citations };
}

async function loadRunBatch(conn: DbConnection, brandId: string, afterId: string | null): Promise<StoredRun[]> {
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
		.where(and(eq(promptRuns.brandId, brandId), afterId ? gt(promptRuns.id, afterId) : undefined))
		.orderBy(asc(promptRuns.id))
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

/** Replaces a run's citations wholesale, matching the shape saveCitations writes in process-prompt. */
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

/** One batch, one transaction: every row rewrite and the dirty marks it earns land together or not at all. */
async function processBatch(
	conn: DbConnection,
	brandId: string,
	ctx: BrandContext,
	plans: RowPlan[],
	rawById: Map<string, unknown>,
): Promise<{ rewritten: number }> {
	return inTransaction(conn, async (tx) => {
		let rewritten = 0;
		const touched: Date[] = [];
		for (const rowPlan of plans) {
			const update = buildRowUpdate(rowPlan, rawById.get(rowPlan.row.id), ctx);
			if (!update) continue;
			// buildRowUpdate never returns both an empty columns object and no citations.
			await tx.update(promptRuns).set(update.columns).where(eq(promptRuns.id, rowPlan.row.id));
			if (update.citations) await replaceCitations(tx, rowPlan.row, brandId, update.citations);
			rewritten++;
			touched.push(rowPlan.row.createdAt);
		}
		if (touched.length > 0) await markDirtyForTimestamps(tx, brandId, touched, "reprocess");
		return { rewritten };
	});
}

interface BrandProcessResult {
	processed: number;
	rewritten: number;
	timedOut: boolean;
	lastId: string | null;
}

async function processRunsForBrand(
	conn: DbConnection,
	brandId: string,
	ctx: BrandContext,
	data: ReprocessData,
	startAfterId: string | null,
	deadline: number,
): Promise<BrandProcessResult> {
	let afterId = startAfterId;
	let processed = 0;
	let rewritten = 0;

	for (;;) {
		if (Date.now() > deadline) return { processed, rewritten, timedOut: true, lastId: afterId };
		const rows = await loadRunBatch(conn, brandId, afterId);
		if (rows.length === 0) break;

		const plans = rows.map((row) => planRow(row, ctx, data));
		const rawById = await loadRawMap(
			conn,
			plans.filter((p) => p.plan.needsRaw).map((p) => p.row.id),
		);
		const batch = await processBatch(conn, brandId, ctx, plans, rawById);

		processed += rows.length;
		rewritten += batch.rewritten;
		afterId = rows[rows.length - 1].id;
	}
	return { processed, rewritten, timedOut: false, lastId: afterId };
}

function sameTags(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

/** Prompt tags read the same brand config the mentions deriver does, so a reprocess that touched interpretation recomputes them too. */
async function recomputeSystemTags(conn: DbConnection, brand: Brand): Promise<number> {
	const brandPrompts = await conn
		.select({ id: prompts.id, value: prompts.value, systemTags: prompts.systemTags })
		.from(prompts)
		.where(eq(prompts.brandId, brand.id));

	let updated = 0;
	for (const prompt of brandPrompts) {
		const nextTags = computeSystemTags(prompt.value, brand.name, brand.website);
		if (sameTags(nextTags, prompt.systemTags)) continue;
		await conn.update(prompts).set({ systemTags: nextTags }).where(eq(prompts.id, prompt.id));
		updated++;
	}
	return updated;
}

async function loadBrandContext(
	conn: DbConnection,
	brandId: string,
): Promise<{ brand: Brand; ctx: BrandContext } | null> {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	return { brand, ctx: brandContextFrom(brand, brandCompetitors) };
}

async function resolveBrandIds(conn: DbConnection, data: ReprocessData): Promise<string[]> {
	if (data.brandId) return [data.brandId];
	const startId = data.cursor?.brandId;
	const rows = await conn
		.select({ id: brands.id })
		.from(brands)
		.where(startId ? gte(brands.id, startId) : undefined)
		.orderBy(asc(brands.id));
	return rows.map((row) => row.id);
}

/** Sends the continuation job for a run that hit its time budget. No singleton key: reprocess is idempotent, so a duplicate in flight costs nothing but redone work. */
async function sendContinuation(
	sendBoss: BossSender,
	data: ReprocessData,
	brandId: string,
	lastRunId: string | null,
): Promise<void> {
	await sendBoss.send(REPROCESS_QUEUE, { ...data, cursor: { brandId, lastRunId } });
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

async function processBrand(
	conn: DbConnection,
	data: ReprocessData,
	brandId: string,
	deadline: number,
): Promise<BrandProcessResult | null> {
	const context = await loadBrandContext(conn, brandId);
	if (!context) {
		console.log(`[reprocess] brand ${brandId} no longer exists, skipping`);
		return null;
	}

	const startAfterId = data.cursor?.brandId === brandId ? (data.cursor.lastRunId ?? null) : null;
	const result = await processRunsForBrand(conn, brandId, context.ctx, data, startAfterId, deadline);
	console.log(
		`[reprocess] brand ${brandId} processed=${result.processed} rewritten=${result.rewritten} skipped=${result.processed - result.rewritten}`,
	);

	if (!result.timedOut && data.layers.includes("interpretation")) {
		const tagsUpdated = await recomputeSystemTags(conn, context.brand);
		console.log(`[reprocess] brand ${brandId} system_tags updated=${tagsUpdated}`);
	}
	return result;
}

export async function runReprocess(
	data: ReprocessData,
	conn: DbConnection = db,
	sendBoss: BossSender = boss,
): Promise<void> {
	const deadline = Date.now() + TIME_BUDGET_MS;
	const brandIds = await resolveBrandIds(conn, data);

	for (const brandId of brandIds) {
		const result = await processBrand(conn, data, brandId, deadline);
		if (result?.timedOut) {
			await sendContinuation(sendBoss, data, brandId, result.lastId);
			return;
		}
	}

	await triggerRefresh(sendBoss);
}

export async function reprocessJob(jobs: Job<ReprocessData>[]): Promise<void> {
	for (const job of jobs) {
		await runReprocess(job.data);
	}
}
