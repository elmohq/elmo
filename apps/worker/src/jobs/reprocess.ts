import {
	type AnalysisVersions,
	currentAnalysisVersions,
	EXTRACTION_KEY,
	MENTIONS_KEY,
} from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { loadRawOutputs, updateExtractions, updateMentions } from "@workspace/lib/db/runs";
import {
	type Brand,
	brands,
	type Competitor,
	citations,
	competitors,
	promptRuns,
	prompts,
	runExtractions,
	runMentions,
} from "@workspace/lib/db/schema";
import { type MentionConfig, mentionConfigFrom, type RunMentionAssessments } from "@workspace/lib/mentions";
import { insertRunsCitations, markDirty } from "@workspace/lib/rollups";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { type Citation, extractRun } from "@workspace/lib/text-extraction";
import { and, asc, eq, gte, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { getBoss } from "../boss";
import { mentionAnalyzer } from "../mention-judge/analyze";

export const REPROCESS_QUEUE = "reprocess";

export type ReprocessLayer = "extraction" | "interpretation";

export interface ReprocessData {
	brandId: string;
	layers: ReprocessLayer[];
}

const LAYER_KEY: Record<ReprocessLayer, string> = { extraction: EXTRACTION_KEY, interpretation: MENTIONS_KEY };

const BATCH_SIZE = 200;
const TIME_BUDGET_MS = 4 * 60 * 1000;
const RECENT_FIRST_MS = 30 * 24 * 60 * 60 * 1000;

export interface StaleRun {
	id: string;
	promptId: string;
	createdAt: Date;
	model: string;
	provider: string | null;
	textContent: string | null;
	/** Loaded (through `loadRawOutputs`) only when the run's text has to be (re)extracted. */
	rawOutput: unknown;
	/** The stamps its derived rows carry, keyed like the brand's. */
	stamps: AnalysisVersions;
	brandMentioned: boolean;
	competitorsMentioned: string[];
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

const isStale = (run: StaleRun, layer: ReprocessLayer, target: AnalysisVersions) =>
	run.stamps[LAYER_KEY[layer]] !== target[LAYER_KEY[layer]];

/**
 * Brings one run up to `target` for the requested layers. A run that predates
 * stored text gets it filled in for mention matching, but keeps its extraction
 * stamp: its citations weren't re-extracted.
 *
 * A replay never replaces something with nothing. Payloads stored by older code
 * may lack what that code read at the time, so when the stored payload yields no
 * text, no citations, or (for want of text) no mentions where the run has some,
 * the run keeps what it has and `kept` says so. The stamp still moves, so the run
 * isn't retried forever.
 */
export async function deriveRunUpdate(
	run: StaleRun,
	layers: ReprocessLayer[],
	target: AnalysisVersions,
	config: MentionConfig,
): Promise<RunUpdate> {
	const update: RunUpdate = { kept: [] };
	const extract = layers.includes("extraction") && isStale(run, "extraction", target);
	const text = extract || run.textContent === null ? reextract(run, extract, target, update) : run.textContent;
	if (layers.includes("interpretation") && isStale(run, "interpretation", target)) {
		update.mentions = { ...(await rederiveMentions(run, text, config, update)), stamp: target[MENTIONS_KEY] };
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
	update: RunUpdate,
): Promise<Omit<NonNullable<RunUpdate["mentions"]>, "stamp">> {
	if (text !== null || (!run.brandMentioned && run.competitorsMentioned.length === 0)) {
		const { mentionAssessments, ...mentions } = await mentionAnalyzer().analyze(text, config);
		return { ...mentions, assessments: mentionAssessments };
	}
	update.kept.push("mentions");
	return { brandMentioned: run.brandMentioned, competitorsMentioned: run.competitorsMentioned, assessments: null };
}

const STAMP_COLUMN: Record<ReprocessLayer, SQL> = {
	extraction: sql`${runExtractions.stamp}`,
	interpretation: sql`${runMentions.stamp}`,
};

const staleFor = (layer: ReprocessLayer, target: AnalysisVersions): SQL =>
	sql`${STAMP_COLUMN[layer]} IS DISTINCT FROM ${target[LAYER_KEY[layer]]}`;

/**
 * The next stale runs of one prompt, oldest first. Rewritten runs stop matching,
 * so the walk needs no cursor beyond "not before the last batch": runs sharing
 * its last timestamp are read again but only rewritten if still stale.
 */
async function loadStaleRuns(
	conn: DbConnection,
	pass: Pass,
	promptId: string,
	from: Date | null,
	/** Limits the walk to runs created since then; null walks the whole history. */
	since: Date | null,
	limit = BATCH_SIZE,
): Promise<StaleRun[]> {
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
			citationCount: sql<number>`(SELECT count(*) FROM ${citations} WHERE ${citations.promptRunId} = ${promptRuns.id})::int`,
		})
		.from(promptRuns)
		.innerJoin(runExtractions, eq(runExtractions.runId, promptRuns.id))
		.innerJoin(runMentions, eq(runMentions.runId, promptRuns.id))
		.where(
			and(
				eq(promptRuns.promptId, promptId),
				eq(promptRuns.brandId, pass.brandId),
				from ? gte(promptRuns.createdAt, from) : undefined,
				since ? gte(promptRuns.createdAt, since) : undefined,
				or(...pass.layers.map((layer) => staleFor(layer, pass.target))),
			),
		)
		.orderBy(asc(promptRuns.createdAt))
		.limit(limit);
	const needsRaw = rows.filter(
		(row) =>
			row.textContent === null ||
			(pass.layers.includes("extraction") && row.extractionStamp !== pass.target[EXTRACTION_KEY]),
	);
	const raw = await loadRawOutputs(
		conn,
		needsRaw.map((row) => row.id),
	);
	return rows.map(({ extractionStamp, mentionsStamp, ...run }) => ({
		...run,
		rawOutput: raw.get(run.id),
		stamps: {
			...(extractionStamp ? { [EXTRACTION_KEY]: extractionStamp } : {}),
			...(mentionsStamp ? { [MENTIONS_KEY]: mentionsStamp } : {}),
		},
	}));
}

interface Pass {
	brandId: string;
	layers: ReprocessLayer[];
	target: AnalysisVersions;
	config: MentionConfig;
	/** Runs whose stored payload yielded less than they already had; see `deriveRunUpdate`. */
	keptRuns: number;
}

/**
 * Derives runs in parallel, one lane per judge session, until the deadline. Judging an answer
 * takes real time, so a batch can outlast the pass's budget; what was derived is still written.
 */
async function deriveUpdates(pass: Pass, runs: StaleRun[], deadline: number) {
	const updates: { run: StaleRun; update: RunUpdate }[] = [];
	let started = 0;
	let failed = false;
	// Runs are taken in order and every one started finishes, so what's derived is always a
	// prefix and the walk's cursor never skips a run. One failure stops the other lanes, since
	// the batch is thrown away and retried.
	const lane = async () => {
		while (!failed && started < runs.length && Date.now() <= deadline) {
			const i = started++;
			try {
				updates[i] = { run: runs[i], update: await deriveRunUpdate(runs[i], pass.layers, pass.target, pass.config) };
			} catch (error) {
				failed = true;
				throw error;
			}
		}
	};
	await Promise.all(Array.from({ length: mentionAnalyzer().concurrency }, lane));
	return updates;
}

/** Rewrites only the derived rows, a few statements per batch: `prompt_runs` itself is append-only. Returns how many runs kept something. */
function rewriteRuns(conn: DbConnection, pass: Pass, updates: { run: StaleRun; update: RunUpdate }[]): Promise<number> {
	const runs = updates.map(({ run }) => run);
	const recited = updates.filter(({ update }) => update.citations);
	return conn.transaction(async (tx) => {
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
				recited.map(({ run, update }) => ({
					run: { ...run, brandId: pass.brandId },
					citations: update.citations ?? [],
				})),
			);
		}
		await markDirty(
			tx,
			pass.brandId,
			runs.map((run) => run.createdAt),
		);
		return updates.filter(({ update }) => update.kept.length > 0).length;
	});
}

/** Rewrites a prompt's stale runs, returning how many; null when the deadline cut it short. */
async function reprocessPrompt(
	conn: DbConnection,
	pass: Pass,
	promptId: string,
	deadline: number,
	since: Date | null,
): Promise<number | null> {
	let from: Date | null = null;
	let rewritten = 0;
	for (;;) {
		if (Date.now() > deadline) return null;
		const runs = await loadStaleRuns(conn, pass, promptId, from, since);
		const updates = await deriveUpdates(pass, runs, deadline);
		if (updates.length > 0) pass.keptRuns += await rewriteRuns(conn, pass, updates);
		rewritten += updates.length;
		if (updates.length < runs.length) return null;
		if (runs.length < BATCH_SIZE) return rewritten;
		from = runs[runs.length - 1].createdAt;
	}
}

/** How many runs were rewritten; null when the deadline cut the walk short. */
async function reprocessPrompts(
	conn: DbConnection,
	pass: Pass,
	promptIds: string[],
	deadline: number,
	since: Date | null,
): Promise<number | null> {
	let rewritten = 0;
	for (const id of promptIds) {
		const count = await reprocessPrompt(conn, pass, id, deadline, since);
		if (count === null) return null;
		rewritten += count;
	}
	return rewritten;
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
): Promise<{ brand: Brand; config: MentionConfig; current: AnalysisVersions } | null> {
	const [brand] = await conn.select().from(brands).where(eq(brands.id, brandId)).limit(1);
	if (!brand) return null;
	const brandCompetitors = await conn.select().from(competitors).where(eq(competitors.brandId, brandId));
	const config = mentionConfigFrom(brand, brandCompetitors);
	return { brand, config, current: currentAnalysisVersions(config, mentionAnalyzer().judgeVersion) };
}

/** Stately per brand: one job runs and at most one waits, so passes for a brand never interleave. */
export function sendReprocess(boss: Pick<PgBoss, "send">, data: ReprocessData): Promise<string | null> {
	return boss.send(REPROCESS_QUEUE, data, { singletonKey: data.brandId });
}

/**
 * Recent runs first, across every prompt: they're what the dashboards show. Having rewritten any,
 * the pass yields, so every brand queued behind it gets its recent runs done before any brand
 * moves on to older history.
 */
async function walkRecentFirst(
	conn: DbConnection,
	pass: Pass,
	promptIds: string[],
	deadline: number,
): Promise<"done" | "yielded" | "out of time"> {
	const recent = await reprocessPrompts(conn, pass, promptIds, deadline, new Date(Date.now() - RECENT_FIRST_MS));
	if (recent === null) return "out of time";
	if (recent > 0) return "yielded";
	return (await reprocessPrompts(conn, pass, promptIds, deadline, null)) === null ? "out of time" : "done";
}

/**
 * Brings a brand's runs up to its current config and today's code. A pass that
 * runs out of time re-queues itself and starts over: rewritten runs no longer
 * match the stale filter, and runs written under a config that has since moved
 * match it again, so a mid-pass config change needs no special handling.
 */
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
	const pass: Pass = {
		brandId: data.brandId,
		layers: data.layers,
		target: context.current,
		config: context.config,
		keptRuns: 0,
	};

	const brandPrompts = await conn
		.select({ id: prompts.id })
		.from(prompts)
		.where(eq(prompts.brandId, data.brandId))
		.orderBy(asc(prompts.id));
	const walk = await walkRecentFirst(
		conn,
		pass,
		brandPrompts.map(({ id }) => id),
		deadline,
	);
	if (pass.keptRuns > 0) {
		console.warn(
			`[reprocess] brand ${data.brandId}: ${pass.keptRuns} runs kept existing data their stored payload no longer yields`,
		);
	}
	if (walk !== "done") {
		const sent = await sendReprocess(boss, data);
		const why = walk === "yielded" ? "recent runs done, older history next" : "out of time";
		console.log(`[reprocess] brand ${data.brandId} ${why}; ${sent ? "continuing" : "a queued pass continues"}`);
		return;
	}

	if (data.layers.includes("interpretation")) await recomputeSystemTags(conn, context.brand);

	// Stamping the brand after its config moved would hide the history derived
	// from the old one; left stale, the next maintenance pass requests a new pass.
	const target = pickLayers(pass.target, data.layers);
	const latest = await loadBrand(conn, data.brandId);
	if (!latest || JSON.stringify(pickLayers(latest.current, data.layers)) !== JSON.stringify(target)) {
		console.log(`[reprocess] brand ${data.brandId} config changed during the pass, leaving it stale`);
		return;
	}
	await conn
		.update(brands)
		.set({
			analysisVersions: sql`coalesce(${brands.analysisVersions}, '{}'::jsonb) || ${JSON.stringify(target)}::jsonb`,
		})
		.where(eq(brands.id, data.brandId));
	console.log(`[reprocess] brand ${data.brandId} brought to ${JSON.stringify(target)}`);

	// A run whose writer read the old config can commit after the walk passed its
	// prompt. Checking after stamping misses it only if that write stayed open
	// through the whole pass.
	for (const { id } of brandPrompts) {
		if ((await loadStaleRuns(conn, pass, id, null, null, 1)).length === 0) continue;
		await sendReprocess(boss, data);
		console.log(`[reprocess] brand ${data.brandId} has runs written mid-pass, going again`);
		return;
	}
}

/**
 * Requests a pass for every brand whose history no longer matches its config or
 * today's code, so a missed config change or a dropped job heals on the next
 * maintenance tick. A brand already waiting on a pass keeps that one.
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
		if (layers.length > 0 && (await sendReprocess(boss, { brandId: brand.id, layers }))) requested++;
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
			.set({ analysisVersions: currentAnalysisVersions(mentionConfigFrom(brand, brandCompetitors)) })
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
