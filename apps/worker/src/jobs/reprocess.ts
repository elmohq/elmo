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
import { markDirty, REFRESH_ROLLUPS_QUEUE } from "@workspace/lib/rollups";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { type Citation, EXTRACTOR_VERSION, extractRun, tryExtractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, eq, gte, inArray, isNull, type SQL, sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { getBoss } from "../boss";

export const REPROCESS_QUEUE = "reprocess";

export type ReprocessLayer = "extraction" | "interpretation";

export type AnalysisVersions = Record<string, string>;

export interface ReprocessData {
	brandId: string;
	layers: ReprocessLayer[];
	/**
	 * The brand stamps this pass brings history to. Carried across continuations
	 * so a segment that finds the brand's config has since moved knows the rows
	 * behind its cursor were derived from the old one.
	 */
	target?: AnalysisVersions;
	after?: RunCursor | null;
}

/**
 * Keyset position in a brand's runs, walked prompt by prompt (in id order) and
 * within a prompt by `(created_at, id)`, so the `(prompt_id, created_at)` index
 * serves every batch. `createdAt` is the exact microsecond text Postgres
 * returned: a JS Date drops the microseconds, and a cursor rounded down to the
 * millisecond would hand back the same rows forever once a batch's worth of
 * runs share that millisecond.
 */
export interface RunCursor {
	promptId: string;
	/** The last run handled in that prompt; null to start at its first run. */
	last: RunPosition | null;
}

interface RunPosition {
	createdAt: string;
	id: string;
}

const BATCH_SIZE = 200;
const TIME_BUDGET_MS = 4 * 60 * 1000;

export type BossClient = Pick<PgBoss, "send" | "findJobs">;

export interface RunHead {
	id: string;
	promptId: string;
	createdAt: Date;
	cursorAt: string;
	model: string;
	provider: string | null;
	hasText: boolean;
	extractorVersion: number | null;
	analysisVersions: AnalysisVersions;
}

export interface BrandMentions {
	config: MentionConfig;
	stamp: string;
}

export interface RowWork {
	extraction: boolean;
	mentions: boolean;
}

/** What a row's update derives from; each part is present only when the plan needed it. */
export interface RowSource {
	text?: string | null;
	raw?: unknown;
}

function planRow(row: RunHead, layers: ReprocessLayer[], mentions: BrandMentions): RowWork {
	return {
		extraction: layers.includes("extraction") && row.extractorVersion !== EXTRACTOR_VERSION,
		mentions: layers.includes("interpretation") && row.analysisVersions[MENTIONS_ANALYSIS_KEY] !== mentions.stamp,
	};
}

const needsRaw = (row: RunHead, work: RowWork) => work.extraction || (work.mentions && !row.hasText);
const needsText = (row: RunHead, work: RowWork) => work.mentions && !work.extraction && row.hasText;

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

export function buildRowUpdate(
	row: RunHead,
	work: RowWork,
	source: RowSource,
	mentions: BrandMentions,
): RowUpdate | null {
	const columns: RowColumns = {};
	let citations: Citation[] | undefined;
	let text = source.text ?? null;

	if (work.extraction) {
		if (source.raw === undefined) return null;
		const extracted = extractRun(source.raw, row.provider ?? row.model);
		columns.textContent = extracted.textContent;
		columns.extractorVersion = EXTRACTOR_VERSION;
		citations = extracted.citations;
		text = extracted.textContent;
	} else if (work.mentions && !row.hasText && source.raw !== undefined) {
		// The extractor stamp stays as it was: citations weren't re-extracted, so
		// an extraction pass must still treat the row as stale.
		columns.textContent = tryExtractTextContent(source.raw, row.provider ?? row.model);
		text = columns.textContent;
	}

	if (work.mentions) {
		Object.assign(columns, analyzeRunMentions(text, mentions.config));
		columns.analysisVersions = sql`${promptRuns.analysisVersions} || ${JSON.stringify({ [MENTIONS_ANALYSIS_KEY]: mentions.stamp })}::jsonb`;
	}

	if (Object.keys(columns).length === 0) return null;
	return { columns, citations };
}

async function loadBrandPromptIds(conn: DbConnection, brandId: string, from: string | null): Promise<string[]> {
	const rows = await conn
		.select({ id: prompts.id })
		.from(prompts)
		.where(and(eq(prompts.brandId, brandId), from ? gte(prompts.id, from) : undefined))
		.orderBy(asc(prompts.id));
	return rows.map((row) => row.id);
}

async function loadRunBatch(
	conn: DbConnection,
	brandId: string,
	promptId: string,
	after: RunPosition | null,
): Promise<RunHead[]> {
	return conn
		.select({
			id: promptRuns.id,
			promptId: promptRuns.promptId,
			createdAt: promptRuns.createdAt,
			cursorAt: sql<string>`to_char(${promptRuns.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
			model: promptRuns.model,
			provider: promptRuns.provider,
			hasText: sql<boolean>`${promptRuns.textContent} IS NOT NULL`,
			extractorVersion: promptRuns.extractorVersion,
			analysisVersions: promptRuns.analysisVersions,
		})
		.from(promptRuns)
		.where(
			and(
				eq(promptRuns.promptId, promptId),
				eq(promptRuns.brandId, brandId),
				after
					? sql`(${promptRuns.createdAt}, ${promptRuns.id}) > (${after.createdAt}::timestamptz, ${after.id}::uuid)`
					: undefined,
			),
		)
		.orderBy(asc(promptRuns.createdAt), asc(promptRuns.id))
		.limit(BATCH_SIZE);
}

/** Text and raw payloads are fetched only for the rows that need them, so skimming current rows stays cheap. */
async function loadSources(
	conn: DbConnection,
	planned: { row: RunHead; work: RowWork }[],
): Promise<Map<string, RowSource>> {
	const rawIds = planned.filter(({ row, work }) => needsRaw(row, work)).map(({ row }) => row.id);
	const textIds = planned.filter(({ row, work }) => needsText(row, work)).map(({ row }) => row.id);
	const sources = new Map<string, RowSource>();
	if (rawIds.length > 0) {
		const rows = await conn
			.select({ id: promptRuns.id, rawOutput: promptRuns.rawOutput })
			.from(promptRuns)
			.where(inArray(promptRuns.id, rawIds));
		for (const row of rows) sources.set(row.id, { raw: row.rawOutput });
	}
	if (textIds.length > 0) {
		const rows = await conn
			.select({ id: promptRuns.id, textContent: promptRuns.textContent })
			.from(promptRuns)
			.where(inArray(promptRuns.id, textIds));
		for (const row of rows) sources.set(row.id, { text: row.textContent });
	}
	return sources;
}

async function replaceCitations(tx: DbConnection, row: RunHead, brandId: string, extracted: Citation[]): Promise<void> {
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
	planned: { row: RunHead; work: RowWork }[],
	sources: Map<string, RowSource>,
): Promise<number> {
	return conn.transaction(async (tx) => {
		const touched: Date[] = [];
		for (const { row, work } of planned) {
			const update = buildRowUpdate(row, work, sources.get(row.id) ?? {}, mentions);
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
	/** Where to resume, or null once every prompt's runs have been walked. */
	resumeAt: RunCursor | null;
}

async function processRunsForBrand(
	conn: DbConnection,
	brandId: string,
	mentions: BrandMentions,
	layers: ReprocessLayer[],
	startAt: RunCursor | null,
	deadline: number,
): Promise<BrandProcessResult> {
	let processed = 0;
	let rewritten = 0;

	for (const promptId of await loadBrandPromptIds(conn, brandId, startAt?.promptId ?? null)) {
		let after = startAt?.promptId === promptId ? startAt.last : null;
		for (;;) {
			if (Date.now() > deadline) return { processed, rewritten, resumeAt: { promptId, last: after } };
			const rows = await loadRunBatch(conn, brandId, promptId, after);
			if (rows.length === 0) break;

			const planned = rows.map((row) => ({ row, work: planRow(row, layers, mentions) }));
			const sources = await loadSources(conn, planned);
			processed += rows.length;
			rewritten += await processBatch(conn, brandId, mentions, planned, sources);

			const last = rows[rows.length - 1];
			after = { createdAt: last.cursorAt, id: last.id };
			if (rows.length < BATCH_SIZE) break;
		}
	}
	return { processed, rewritten, resumeAt: null };
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
export function brandVersions(config: MentionConfig): AnalysisVersions {
	return { [EXTRACTION_ANALYSIS_KEY]: String(EXTRACTOR_VERSION), [MENTIONS_ANALYSIS_KEY]: mentionsStamp(config) };
}

/** Re-deriving text changes what mentions are found, so extraction always brings interpretation along. */
export function staleLayers(stored: AnalysisVersions, current: AnalysisVersions): ReprocessLayer[] {
	if (stored[EXTRACTION_ANALYSIS_KEY] !== current[EXTRACTION_ANALYSIS_KEY]) return ["extraction", "interpretation"];
	if (stored[MENTIONS_ANALYSIS_KEY] !== current[MENTIONS_ANALYSIS_KEY]) return ["interpretation"];
	return [];
}

function pickLayers(versions: AnalysisVersions, layers: ReprocessLayer[]): AnalysisVersions {
	return Object.fromEntries(
		Object.entries(versions).filter(([key]) =>
			key === EXTRACTION_ANALYSIS_KEY ? layers.includes("extraction") : layers.includes("interpretation"),
		),
	);
}

function sameVersions(a: AnalysisVersions, b: AnalysisVersions): boolean {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
	return [...keys].every((key) => a[key] === b[key]);
}

async function loadBrand(
	conn: DbConnection,
	brandId: string,
): Promise<{ brand: Brand; mentions: BrandMentions; current: AnalysisVersions } | null> {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	const config = mentionConfigFrom(brand, brandCompetitors);
	return { brand, mentions: { config, stamp: mentionsStamp(config) }, current: brandVersions(config) };
}

/**
 * Stately per brand: one job runs and at most one waits, so jobs for a brand
 * never interleave.
 */
export function sendReprocess(boss: Pick<PgBoss, "send">, data: ReprocessData): Promise<string | null> {
	return boss.send(REPROCESS_QUEUE, data, { singletonKey: data.brandId });
}

async function triggerRefresh(boss: Pick<PgBoss, "send">): Promise<void> {
	try {
		await boss.send(
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
	boss: Pick<PgBoss, "send"> = getBoss(),
): Promise<void> {
	const deadline = Date.now() + TIME_BUDGET_MS;
	const context = await loadBrand(conn, data.brandId);
	if (!context) {
		console.log(`[reprocess] brand ${data.brandId} no longer exists, skipping`);
		return;
	}

	const target = context.current;
	const moved = data.target !== undefined && !sameVersions(data.target, target);
	const layers = moved ? [...new Set([...data.layers, ...staleLayers(data.target ?? {}, target)])] : data.layers;
	let startAt = data.after ?? null;
	// Rows behind a continuation's cursor were derived for its target; if the
	// brand has moved on since, they're stale too, so the walk starts over.
	if (startAt && (moved || data.target === undefined)) {
		startAt = null;
		console.log(`[reprocess] brand ${data.brandId} config changed mid-pass, restarting from the beginning`);
	}

	const result = await processRunsForBrand(conn, data.brandId, context.mentions, layers, startAt, deadline);
	console.log(
		`[reprocess] brand ${data.brandId} processed=${result.processed} rewritten=${result.rewritten} resume=${result.resumeAt !== null}`,
	);
	if (result.rewritten > 0) await triggerRefresh(boss);
	if (result.resumeAt) {
		const sent = await sendReprocess(boss, { brandId: data.brandId, layers, target, after: result.resumeAt });
		// A queued job already holds the brand's slot; it walks from the start and
		// skims the rows this pass brought current.
		if (!sent) console.log(`[reprocess] brand ${data.brandId} already has a queued pass, not continuing this one`);
		return;
	}

	if (layers.includes("interpretation")) await recomputeSystemTags(conn, context.brand);

	// History now matches `target`. Stamping it after a newer config landed
	// would hide that history from the stale pass, so it only goes on if the
	// brand still resolves to it; otherwise the stale pass requests a new one.
	const latest = await loadBrand(conn, data.brandId);
	if (!latest || !sameVersions(latest.current, target)) {
		console.log(`[reprocess] brand ${data.brandId} config changed during the pass, leaving it stale`);
		return;
	}
	await conn
		.update(brands)
		.set({
			analysisVersions: sql`coalesce(${brands.analysisVersions}, '{}'::jsonb) || ${JSON.stringify(pickLayers(target, layers))}::jsonb`,
		})
		.where(eq(brands.id, data.brandId));
}

const PENDING_STATES = new Set(["created", "retry", "active"]);

async function hasPendingReprocess(boss: Pick<PgBoss, "findJobs">, brandId: string): Promise<boolean> {
	const jobs = await boss.findJobs(REPROCESS_QUEUE, { key: brandId });
	return jobs.some((job) => PENDING_STATES.has(job.state));
}

/**
 * Finds brands whose history no longer matches their current config or today's
 * code and requests a reprocess for each, so a missed config change or a
 * dropped job heals on the next pass. A brand with a pass already queued or
 * running is left to it: that pass restarts itself if the config moved, and a
 * second request would take the slot its continuation needs.
 */
export async function requestStaleReprocesses(conn: DbConnection = db, boss: BossClient = getBoss()): Promise<number> {
	const [allBrands, allCompetitors] = await Promise.all([conn.select().from(brands), conn.select().from(competitors)]);
	const competitorsByBrand = new Map<string, Competitor[]>();
	for (const competitor of allCompetitors) {
		competitorsByBrand.set(competitor.brandId, [...(competitorsByBrand.get(competitor.brandId) ?? []), competitor]);
	}

	let requested = 0;
	for (const brand of allBrands) {
		// Not yet adopted at startup; its history is taken as is until then.
		if (brand.analysisVersions === null) continue;
		const current = brandVersions(mentionConfigFrom(brand, competitorsByBrand.get(brand.id) ?? []));
		const layers = staleLayers(brand.analysisVersions, current);
		if (layers.length === 0) continue;
		if (await hasPendingReprocess(boss, brand.id)) continue;
		if (await sendReprocess(boss, { brandId: brand.id, layers, target: current })) requested++;
	}
	return requested;
}

/**
 * Brands that predate stamping adopt today's stamps instead of replaying their
 * whole history on deploy: what they've stored is taken as is until their
 * config or the code next changes.
 */
export async function adoptCurrentStamps(conn: DbConnection = db): Promise<number> {
	const unstamped = await conn.select().from(brands).where(isNull(brands.analysisVersions));
	let adopted = 0;
	for (const brand of unstamped) {
		const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brand.id));
		const updated = await conn
			.update(brands)
			.set({ analysisVersions: brandVersions(mentionConfigFrom(brand, brandCompetitors)) })
			.where(and(eq(brands.id, brand.id), isNull(brands.analysisVersions)))
			.returning({ id: brands.id });
		adopted += updated.length;
	}
	return adopted;
}

export async function reprocessJob(jobs: Job<ReprocessData>[]): Promise<void> {
	for (const job of jobs) {
		await runReprocess(job.data);
	}
}
