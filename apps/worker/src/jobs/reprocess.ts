import {
	type AnalysisVersions,
	currentAnalysisVersions,
	EXTRACTION_KEY,
	MENTIONS_KEY,
} from "@workspace/lib/analysis-versions";
import { db } from "@workspace/lib/db/db";
import type { DbConnection } from "@workspace/lib/db/db-connection";
import { type Brand, brands, citations, competitors, promptRuns, prompts } from "@workspace/lib/db/schema";
import { analyzeRunMentions, type MentionConfig, mentionConfigFrom } from "@workspace/lib/mentions";
import { markDirty } from "@workspace/lib/rollups";
import { computeSystemTags } from "@workspace/lib/tag-utils";
import { type Citation, extractRun } from "@workspace/lib/text-extraction";
import { and, asc, eq, gte, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { getBoss } from "../boss";

export const REPROCESS_QUEUE = "reprocess";

export type ReprocessLayer = "extraction" | "interpretation";

export interface ReprocessData {
	brandId: string;
	layers: ReprocessLayer[];
}

const LAYER_KEY: Record<ReprocessLayer, string> = { extraction: EXTRACTION_KEY, interpretation: MENTIONS_KEY };

const BATCH_SIZE = 200;
const TIME_BUDGET_MS = 4 * 60 * 1000;

export interface StaleRun {
	id: string;
	promptId: string;
	createdAt: Date;
	model: string;
	provider: string | null;
	textContent: string | null;
	/** Loaded only when the run's text has to be (re)extracted. */
	rawOutput: unknown;
	analysisVersions: AnalysisVersions;
}

export interface RunUpdate {
	columns: { textContent?: string | null; brandMentioned?: boolean; competitorsMentioned?: string[] };
	stamps: AnalysisVersions;
	/** Present only when extraction ran: the run's citations are replaced wholesale. */
	citations?: Citation[];
}

const isStale = (run: StaleRun, layer: ReprocessLayer, target: AnalysisVersions) =>
	run.analysisVersions[LAYER_KEY[layer]] !== target[LAYER_KEY[layer]];

/**
 * Brings one run up to `target` for the requested layers. A run that predates
 * stored text gets it filled in for mention matching, but keeps its extraction
 * stamp: its citations weren't re-extracted.
 */
export function deriveRunUpdate(
	run: StaleRun,
	layers: ReprocessLayer[],
	target: AnalysisVersions,
	config: MentionConfig,
): RunUpdate {
	const update: RunUpdate = { columns: {}, stamps: {} };
	let text = run.textContent;

	const extract = layers.includes("extraction") && isStale(run, "extraction", target);
	if (extract || text === null) {
		const extracted = extractRun(run.rawOutput, run.provider ?? run.model);
		text = extracted.textContent;
		update.columns.textContent = text;
		if (extract) {
			update.citations = extracted.citations;
			update.stamps[EXTRACTION_KEY] = target[EXTRACTION_KEY];
		}
	}

	if (layers.includes("interpretation") && isStale(run, "interpretation", target)) {
		Object.assign(update.columns, analyzeRunMentions(text, config));
		update.stamps[MENTIONS_KEY] = target[MENTIONS_KEY];
	}
	return update;
}

const staleFor = (layer: ReprocessLayer, target: AnalysisVersions): SQL =>
	sql`${promptRuns.analysisVersions} ->> ${LAYER_KEY[layer]} IS DISTINCT FROM ${target[LAYER_KEY[layer]]}`;

/**
 * The next stale runs of one prompt, oldest first. Rewritten runs stop matching,
 * so the walk needs no cursor beyond "not before the last batch": runs sharing
 * its last timestamp are read again but only rewritten if still stale.
 */
function loadStaleRuns(conn: DbConnection, pass: Pass, promptId: string, from: Date | null): Promise<StaleRun[]> {
	const needsRaw = pass.layers.includes("extraction")
		? sql`${promptRuns.textContent} IS NULL OR ${staleFor("extraction", pass.target)}`
		: sql`${promptRuns.textContent} IS NULL`;
	return conn
		.select({
			id: promptRuns.id,
			promptId: promptRuns.promptId,
			createdAt: promptRuns.createdAt,
			model: promptRuns.model,
			provider: promptRuns.provider,
			textContent: promptRuns.textContent,
			rawOutput: sql<unknown>`CASE WHEN ${needsRaw} THEN ${promptRuns.rawOutput} END`,
			analysisVersions: promptRuns.analysisVersions,
		})
		.from(promptRuns)
		.where(
			and(
				eq(promptRuns.promptId, promptId),
				eq(promptRuns.brandId, pass.brandId),
				from ? gte(promptRuns.createdAt, from) : undefined,
				or(...pass.layers.map((layer) => staleFor(layer, pass.target))),
			),
		)
		.orderBy(asc(promptRuns.createdAt))
		.limit(BATCH_SIZE);
}

async function replaceCitations(
	tx: DbConnection,
	run: StaleRun,
	brandId: string,
	extracted: Citation[],
): Promise<void> {
	await tx.delete(citations).where(eq(citations.promptRunId, run.id));
	if (extracted.length === 0) return;
	await tx.insert(citations).values(
		extracted.map((c) => ({
			promptRunId: run.id,
			promptId: run.promptId,
			brandId,
			model: run.model,
			url: c.url,
			domain: c.domain,
			title: c.title || null,
			citationIndex: c.citationIndex,
			createdAt: run.createdAt,
		})),
	);
}

interface Pass {
	brandId: string;
	layers: ReprocessLayer[];
	target: AnalysisVersions;
	config: MentionConfig;
}

function rewriteRuns(conn: DbConnection, pass: Pass, runs: StaleRun[]): Promise<void> {
	return conn.transaction(async (tx) => {
		for (const run of runs) {
			const update = deriveRunUpdate(run, pass.layers, pass.target, pass.config);
			await tx
				.update(promptRuns)
				.set({
					...update.columns,
					analysisVersions: sql`${promptRuns.analysisVersions} || ${JSON.stringify(update.stamps)}::jsonb`,
				})
				.where(eq(promptRuns.id, run.id));
			if (update.citations) await replaceCitations(tx, run, pass.brandId, update.citations);
		}
		await markDirty(
			tx,
			pass.brandId,
			runs.map((run) => run.createdAt),
		);
	});
}

/** Rewrites a prompt's stale runs; false when the deadline cut it short. */
async function reprocessPrompt(conn: DbConnection, pass: Pass, promptId: string, deadline: number): Promise<boolean> {
	let from: Date | null = null;
	for (;;) {
		if (Date.now() > deadline) return false;
		const runs = await loadStaleRuns(conn, pass, promptId, from);
		if (runs.length > 0) await rewriteRuns(conn, pass, runs);
		if (runs.length < BATCH_SIZE) return true;
		from = runs[runs.length - 1].createdAt;
	}
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
	return { brand, config, current: currentAnalysisVersions(config) };
}

/** Stately per brand: one job runs and at most one waits, so passes for a brand never interleave. */
export function sendReprocess(boss: Pick<PgBoss, "send">, data: ReprocessData): Promise<string | null> {
	return boss.send(REPROCESS_QUEUE, data, { singletonKey: data.brandId });
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
	const pass: Pass = { brandId: data.brandId, layers: data.layers, target: context.current, config: context.config };

	const brandPrompts = await conn
		.select({ id: prompts.id })
		.from(prompts)
		.where(eq(prompts.brandId, data.brandId))
		.orderBy(asc(prompts.id));
	for (const { id } of brandPrompts) {
		if (await reprocessPrompt(conn, pass, id, deadline)) continue;
		const sent = await sendReprocess(boss, data);
		console.log(`[reprocess] brand ${data.brandId} out of time; ${sent ? "continuing" : "a queued pass continues"}`);
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
	let requested = 0;
	for (const brand of allBrands) {
		// Not yet adopted at startup; its history is taken as is until then.
		if (brand.analysisVersions === null) continue;
		const brandCompetitors = allCompetitors.filter((competitor) => competitor.brandId === brand.id);
		const current = currentAnalysisVersions(mentionConfigFrom(brand, brandCompetitors));
		const layers = staleLayers(brand.analysisVersions, current);
		if (layers.length > 0 && (await sendReprocess(boss, { brandId: brand.id, layers }))) requested++;
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
