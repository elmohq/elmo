import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import type { DbConnection } from "../db/db-connection";
import type { HeapWalkPosition } from "../db/heap-walk";
import { insertRuns } from "../db/runs";
import * as schema from "../db/schema";
import {
	brands,
	citations,
	citedPages,
	organization,
	promptRuns,
	prompts,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupDirty,
	rollupPromptRuns,
	runMentions,
} from "../db/schema";
import type { RunMentionAssessments } from "../mentions";
import { resolveUnpagedCitations } from "./citation-pages";
import { BUCKET_MS, CLASSIFIER_VERSION } from "./constants";
import { markDirty, markPromptRunsDirty, markRunsDirty, pendingMarks, refreshRange } from "./dirty";
import { getPipelineState, setPipelineState } from "./pipeline-state";
import { rebuildRange } from "./rebuild";
import { reclassifyPages } from "./reclassify";

// Truncates shared tables, so nothing else may use this database while it runs.

type TestDb = typeof db;

/** Gives up on a lock quickly, which is how these tests make a rebuild fail. */
const impatient = drizzle({
	connection: { connectionString: process.env.DATABASE_URL, options: "-c lock_timeout=50" },
	schema,
});

afterAll(async () => {
	await impatient.$client.end();
});

const ORG_ID = "org-rollups-test";
const BRAND_ID = "brand-rollups-test";
const PROMPT_1 = "aaaaaaaa-0000-4000-8000-000000000001";
const PROMPT_2 = "aaaaaaaa-0000-4000-8000-000000000002";
const RUN = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;

const B0 = new Date("2026-01-15T10:00:00.000Z");
const B1 = new Date("2026-01-15T10:15:00.000Z");
const B2 = new Date("2026-01-15T10:30:00.000Z");
const B3 = new Date("2026-01-15T10:45:00.000Z");

const GUIDE = "https://example.com/guide";
const GOOGLE_SEARCH = "https://www.google.com/search?q=best+crm";

interface SeedRun {
	id: string;
	promptId: string;
	createdAt: string;
	model: string;
	provider: string | null;
	webSearchEnabled: boolean;
	brandMentioned: boolean;
	competitorsMentioned: string[];
}

const SEED_RUNS: SeedRun[] = [
	{
		id: RUN(1),
		promptId: PROMPT_1,
		createdAt: "2026-01-15T10:02:00.000Z",
		model: "gpt-5",
		provider: null,
		webSearchEnabled: false,
		brandMentioned: true,
		competitorsMentioned: ["Acme", "Globex"],
	},
	{
		id: RUN(2),
		promptId: PROMPT_1,
		createdAt: "2026-01-15T10:08:00.000Z",
		model: "gpt-5",
		provider: null,
		webSearchEnabled: false,
		brandMentioned: false,
		competitorsMentioned: [],
	},
	{
		id: RUN(3),
		promptId: PROMPT_2,
		createdAt: "2026-01-15T10:12:00.000Z",
		model: "gpt-5",
		provider: null,
		webSearchEnabled: false,
		brandMentioned: true,
		competitorsMentioned: ["Acme"],
	},
	{
		id: RUN(4),
		promptId: PROMPT_1,
		createdAt: "2026-01-15T10:20:00.000Z",
		model: "gpt-5",
		provider: "openai-api",
		webSearchEnabled: true,
		brandMentioned: true,
		competitorsMentioned: ["Acme"],
	},
	{
		id: RUN(5),
		promptId: PROMPT_2,
		createdAt: "2026-01-15T10:35:00.000Z",
		model: "claude-sonnet-4-5",
		provider: null,
		webSearchEnabled: false,
		brandMentioned: false,
		competitorsMentioned: ["Globex"],
	},
];

const SEED_CITATIONS = [
	{ run: RUN(1), url: `${GUIDE}?utm_source=openai`, domain: "example.com", title: "Old guide title", citationIndex: 0 },
	{ run: RUN(1), url: "https://docs.example.com/api", domain: "docs.example.com", title: null, citationIndex: 1 },
	{ run: RUN(1), url: GOOGLE_SEARCH, domain: "google.com", title: "best crm", citationIndex: 2 },
	{ run: RUN(2), url: GUIDE, domain: "example.com", title: "Old guide title", citationIndex: 0 },
	{
		run: RUN(3),
		url: "https://www.example.com/guide/",
		domain: "example.com",
		title: "New guide title",
		citationIndex: 1,
	},
	{ run: RUN(4), url: "https://other.com/post", domain: "other.com", title: "Post", citationIndex: 0 },
	{ run: RUN(5), url: GUIDE, domain: "example.com", title: null, citationIndex: 3 },
];

async function reset(db: TestDb): Promise<void> {
	await db.execute(sql`
		TRUNCATE citations, prompt_runs, prompts, competitors, brands, organization,
			rollup_prompt_runs, rollup_competitor_mentions, rollup_citation_urls, cited_pages, rollup_dirty
		RESTART IDENTITY CASCADE
	`);
	await db.execute(sql`INSERT INTO pipeline_state (id) VALUES (1) ON CONFLICT DO NOTHING`);
	await db.execute(sql`UPDATE pipeline_state SET rollup_version = 0`);
}

async function seed(db: TestDb): Promise<void> {
	await db.insert(organization).values({
		id: ORG_ID,
		name: "Rollups Test Org",
		slug: "rollups-test-org",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
	});
	await db.insert(brands).values({
		id: BRAND_ID,
		name: "Rollups Test Brand",
		website: "https://rollups.test",
		organizationId: ORG_ID,
	});
	await db.insert(prompts).values([
		{ id: PROMPT_1, brandId: BRAND_ID, value: "best crm" },
		{ id: PROMPT_2, brandId: BRAND_ID, value: "crm alternatives" },
	]);
	await insertSeedRuns(db, SEED_RUNS);
	await db.insert(citations).values(
		SEED_CITATIONS.map((citation) => {
			const run = SEED_RUNS.find((r) => r.id === citation.run);
			if (!run) throw new Error(`no seed run ${citation.run}`);
			return {
				promptRunId: run.id,
				promptId: run.promptId,
				brandId: BRAND_ID,
				model: run.model,
				url: citation.url,
				domain: citation.domain,
				title: citation.title,
				citationIndex: citation.citationIndex,
				createdAt: new Date(run.createdAt),
			};
		}),
	);
	await resolveUnpagedCitations(db);
	// The backfill marks what it resolved; the tests start from no marks.
	await db.delete(rollupDirty);
}

function insertSeedRuns(db: DbConnection, runs: SeedRun[]) {
	return insertRuns(
		db,
		runs.map((run) => ({
			id: run.id,
			promptId: run.promptId,
			brandId: BRAND_ID,
			model: run.model,
			provider: run.provider,
			version: "1",
			webSearchEnabled: run.webSearchEnabled,
			rawOutput: { text: "seed" },
			mentions: {
				brandMentioned: run.brandMentioned,
				competitorsMentioned: run.competitorsMentioned,
				assessments: null,
				stamp: null,
			},
			createdAt: new Date(run.createdAt),
		})),
	);
}

const runRollupRows = (db: TestDb) =>
	db
		.select()
		.from(rollupPromptRuns)
		.orderBy(asc(rollupPromptRuns.bucket), asc(rollupPromptRuns.promptId), asc(rollupPromptRuns.model));

const competitorRows = (db: TestDb) =>
	db
		.select()
		.from(rollupCompetitorMentions)
		.orderBy(
			asc(rollupCompetitorMentions.bucket),
			asc(rollupCompetitorMentions.promptId),
			asc(rollupCompetitorMentions.competitorName),
		);

const urlRows = (db: TestDb) =>
	db
		.select()
		.from(rollupCitationUrls)
		.orderBy(asc(rollupCitationUrls.bucket), asc(rollupCitationUrls.promptId), asc(rollupCitationUrls.domain));

const pageRows = (db: TestDb) => db.select().from(citedPages).orderBy(asc(citedPages.url));

async function snapshot(db: TestDb) {
	return {
		runs: await runRollupRows(db),
		competitors: await competitorRows(db),
		urls: await urlRows(db),
		pages: await pageRows(db),
	};
}

const rebuildAll = (db: TestDb) => rebuildRange(db, BRAND_ID, B0, B3);

/** Holds the brand's rebuild lock from another session while `fn` runs. */
async function withBrandLocked<T>(fn: () => Promise<T>): Promise<T> {
	const client = await db.$client.connect();
	try {
		await client.query("SELECT pg_advisory_lock(hashtext('elmo-rollups'), hashtext($1))", [BRAND_ID]);
		try {
			return await fn();
		} finally {
			await client.query("SELECT pg_advisory_unlock(hashtext('elmo-rollups'), hashtext($1))", [BRAND_ID]);
		}
	} finally {
		client.release();
	}
}

/**
 * Holds the brand's rollup rows from another session while `fn` runs, so a
 * refresh that has taken its marks stalls (or, with a lock timeout, fails) at
 * its first delete.
 */
async function withRollupRowsLocked<T>(fn: () => Promise<T>): Promise<T> {
	const client = await db.$client.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT 1 FROM rollup_prompt_runs WHERE brand_id = $1 FOR UPDATE", [BRAND_ID]);
		try {
			return await fn();
		} finally {
			await client.query("ROLLBACK");
		}
	} finally {
		client.release();
	}
}

async function waitForLockWaiters(count: number): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt++) {
		const { rows } = await db.execute(sql`
			SELECT count(*)::int AS waiting FROM pg_stat_activity
			WHERE datname = current_database() AND wait_event_type = 'Lock'
		`);
		if ((rows[0] as { waiting: number }).waiting >= count) return;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error(`timed out waiting for ${count} sessions to block on a lock`);
}

describe("rollups against postgres", () => {
	beforeEach(async () => {
		await reset(db);
		await seed(db);
	});

	it("rejects bounds that are not on a bucket boundary", async () => {
		await expect(rebuildRange(db, BRAND_ID, new Date("2026-01-15T10:10:00.000Z"), B3)).rejects.toThrow(/not aligned/);
	});

	it("aggregates runs into the bucket grain", async () => {
		const stats = await rebuildAll(db);
		expect(stats.runs).toBe(4);

		const rows = await runRollupRows(db);
		expect(
			rows.map((r) => ({
				bucket: r.bucket.toISOString(),
				promptId: r.promptId,
				model: r.model,
				provider: r.provider,
				webSearchEnabled: r.webSearchEnabled,
				runs: r.runs,
				brandMentionedRuns: r.brandMentionedRuns,
				competitorRuns: r.competitorRuns,
				competitorMentions: r.competitorMentions,
				noMentionRuns: r.noMentionRuns,
			})),
		).toEqual([
			{
				bucket: B0.toISOString(),
				promptId: PROMPT_1,
				model: "gpt-5",
				provider: "",
				webSearchEnabled: false,
				runs: 2,
				brandMentionedRuns: 1,
				competitorRuns: 1,
				competitorMentions: 2,
				noMentionRuns: 1,
			},
			{
				bucket: B0.toISOString(),
				promptId: PROMPT_2,
				model: "gpt-5",
				provider: "",
				webSearchEnabled: false,
				runs: 1,
				brandMentionedRuns: 1,
				competitorRuns: 1,
				competitorMentions: 1,
				noMentionRuns: 0,
			},
			{
				bucket: B1.toISOString(),
				promptId: PROMPT_1,
				model: "gpt-5",
				provider: "openai-api",
				webSearchEnabled: true,
				runs: 1,
				brandMentionedRuns: 1,
				competitorRuns: 1,
				competitorMentions: 1,
				noMentionRuns: 0,
			},
			{
				bucket: B2.toISOString(),
				promptId: PROMPT_2,
				model: "claude-sonnet-4-5",
				provider: "",
				webSearchEnabled: false,
				runs: 1,
				brandMentionedRuns: 0,
				competitorRuns: 1,
				competitorMentions: 1,
				noMentionRuns: 0,
			},
		]);
		const first = rows[0];
		expect(first.firstRunAt.toISOString()).toBe("2026-01-15T10:02:00.000Z");
		expect(first.lastRunAt.toISOString()).toBe("2026-01-15T10:08:00.000Z");
	});

	it("counts the judge's sentiment and position for runs that mention the brand", async () => {
		const judged = (runId: string, brand: RunMentionAssessments["brand"]) =>
			db
				.update(runMentions)
				.set({ assessments: { brand, competitors: {}, judged: { brand: "acme", competitors: {} } } })
				.where(eq(runMentions.runId, runId));
		await judged(RUN(1), { mentioned: true, probability: 0.95, sentiment: "positive", position: 2 });
		// Not counted as a mention, so its sentiment isn't the brand's.
		await judged(RUN(2), { mentioned: false, probability: 0.1, sentiment: "positive" });
		await judged(RUN(3), { mentioned: true, probability: 0.5, sentiment: "negative", position: 1 });
		await rebuildAll(db);

		const rows = await runRollupRows(db);
		const measures = (promptId: string) => {
			const row = rows.find((r) => r.bucket.getTime() === B0.getTime() && r.promptId === promptId);
			return [row?.positiveRuns, row?.negativeRuns, row?.positionSum, row?.positionedRuns];
		};
		expect(measures(PROMPT_1)).toEqual([1, 0, 2, 1]);
		expect(measures(PROMPT_2)).toEqual([0, 1, 1, 1]);
	});

	it("counts each competitor's sentiment and position", async () => {
		await db
			.update(runMentions)
			.set({
				assessments: {
					competitors: {
						Acme: { mentioned: true, probability: 0.9, sentiment: "negative", position: 1 },
						Globex: { mentioned: true, probability: 0.9, sentiment: "positive", position: 3 },
					},
					judged: { brand: "acme", competitors: { Acme: "acme", Globex: "globex" } },
				},
			})
			.where(eq(runMentions.runId, RUN(1)));
		await rebuildAll(db);

		const rows = (await competitorRows(db)).filter(
			(r) => r.bucket.getTime() === B0.getTime() && r.promptId === PROMPT_1,
		);
		expect(
			rows.map((r) => [r.competitorName, r.positiveRuns, r.negativeRuns, r.positionSum, r.positionedRuns]),
		).toEqual([
			["Acme", 0, 1, 1, 1],
			["Globex", 1, 0, 3, 1],
		]);
	});

	it("counts one row per competitor mentioned", async () => {
		const stats = await rebuildAll(db);
		expect(stats.competitorRows).toBe(5);

		const rows = await competitorRows(db);
		expect(rows.map((r) => [r.bucket.toISOString(), r.promptId, r.competitorName, r.runs])).toEqual([
			[B0.toISOString(), PROMPT_1, "Acme", 1],
			[B0.toISOString(), PROMPT_1, "Globex", 1],
			[B0.toISOString(), PROMPT_2, "Acme", 1],
			[B1.toISOString(), PROMPT_1, "Acme", 1],
			[B2.toISOString(), PROMPT_2, "Globex", 1],
		]);
	});

	it("folds citation URLs and keeps one page per normalized URL", async () => {
		const stats = await rebuildAll(db);
		expect(stats).toMatchObject({ urlRows: 6 });

		const pages = await pageRows(db);
		expect(
			pages.map((page) => [page.url, page.title, page.staticCategory, page.pageType, page.classifierVersion]),
		).toEqual([
			["https://docs.example.com/api", null, "developer", "doc", 1],
			[GUIDE, "New guide title", "editorial", "howto", 1],
			["https://google.com/search?q=best+crm", "best crm", "google", "search", 1],
			// The domain is unlisted, so the page type is what makes this editorial.
			["https://other.com/post", "Post", "editorial", "article", 1],
		]);

		const guide = pages.find((page) => page.url === GUIDE);
		expect(guide?.firstSeenAt.toISOString()).toBe("2026-01-15T10:02:00.000Z");
		expect(guide?.lastSeenAt.toISOString()).toBe("2026-01-15T10:35:00.000Z");

		const urls = await urlRows(db);
		const guideRow = urls.find(
			(row) => row.bucket.getTime() === B0.getTime() && row.promptId === PROMPT_1 && row.pageId === guide?.id,
		);
		expect(guideRow).toMatchObject({ pageId: guide?.id, citations: 2, positionSum: 0 });
		expect(urls.reduce((total, row) => total + row.citations, 0)).toBe(SEED_CITATIONS.length);
	});

	it("keeps the most recently seen title however the ranges are rebuilt", async () => {
		// Newest bucket first, the order the backfill uses, then oldest first.
		for (const order of [
			[B2, B1, B0],
			[B0, B1, B2],
		]) {
			await reset(db);
			await seed(db);
			for (const bucket of order) await rebuildRange(db, BRAND_ID, bucket, new Date(bucket.getTime() + BUCKET_MS));
			const guide = (await pageRows(db)).find((page) => page.url === GUIDE);
			expect(guide?.title).toBe("New guide title");
			expect(guide?.pageType).toBe("howto");
		}
	});

	it("is idempotent", async () => {
		await rebuildAll(db);
		const before = await snapshot(db);
		await rebuildAll(db);
		expect(await snapshot(db)).toEqual(before);
	});

	it("rebuilds only the range it is given", async () => {
		await rebuildAll(db);
		const before = await snapshot(db);

		await insertSeedRuns(db, [
			{
				id: RUN(6),
				promptId: PROMPT_2,
				createdAt: "2026-01-15T10:40:00.000Z",
				model: "claude-sonnet-4-5",
				provider: null,
				webSearchEnabled: false,
				brandMentioned: true,
				competitorsMentioned: [],
			},
		]);
		await rebuildRange(db, BRAND_ID, B2, B3);

		const after = await snapshot(db);
		expect(after.runs.filter((r) => r.bucket.getTime() < B2.getTime())).toEqual(
			before.runs.filter((r) => r.bucket.getTime() < B2.getTime()),
		);
		expect(after.urls).toEqual(before.urls);
		const updated = after.runs.find((r) => r.bucket.getTime() === B2.getTime());
		expect(updated).toMatchObject({ runs: 2, brandMentionedRuns: 1, competitorRuns: 1, competitorMentions: 1 });
	});

	it("drops rollup rows for runs that no longer exist", async () => {
		await rebuildAll(db);
		await db.delete(citations).where(eq(citations.promptRunId, RUN(5)));
		await db.delete(promptRuns).where(eq(promptRuns.id, RUN(5)));
		await rebuildRange(db, BRAND_ID, B2, B3);

		const rows = await runRollupRows(db);
		expect(rows.some((r) => r.bucket.getTime() === B2.getTime())).toBe(false);
		expect(rows).toHaveLength(3);
	});

	it("totals the same runs, mentions and citations as the raw rows", async () => {
		await rebuildAll(db);
		const [rollup] = (
			await db.execute(sql`
				SELECT sum(runs)::int AS runs, sum(brand_mentioned_runs)::int AS mentioned, sum(no_mention_runs)::int AS silent,
					(SELECT sum(citations)::int FROM rollup_citation_urls WHERE brand_id = ${BRAND_ID}) AS citations
				FROM rollup_prompt_runs WHERE brand_id = ${BRAND_ID}
			`)
		).rows;
		expect(rollup).toEqual({ runs: 5, mentioned: 3, silent: 1, citations: SEED_CITATIONS.length });
	});

	it("joins a caller's transaction", async () => {
		await expect(
			db.transaction(async (tx) => {
				await rebuildRange(tx, BRAND_ID, B0, B3);
				expect(await tx.select().from(rollupPromptRuns)).toHaveLength(4);
				throw new Error("caller rolled back");
			}),
		).rejects.toThrow("caller rolled back");
		expect(await runRollupRows(db)).toEqual([]);
	});

	it("reclassifies pages left on an older classifier version", async () => {
		await rebuildAll(db);
		await db.execute(sql`
			UPDATE cited_pages SET page_type = 'stale', static_category = 'stale', classifier_version = 0
		`);

		expect(await reclassifyPages(db, 2)).toBe(4);
		expect(await reclassifyPages(db)).toBe(0);

		const pages = await pageRows(db);
		expect(pages.every((page) => page.classifierVersion === CLASSIFIER_VERSION)).toBe(true);
		expect(pages.map((page) => [page.staticCategory, page.pageType])).toEqual([
			["developer", "doc"],
			["editorial", "howto"],
			["google", "search"],
			["editorial", "article"],
		]);
	});

	it("resolves unpaged citations a window of heap pages at a time", async () => {
		const run = SEED_RUNS[0];
		await db.insert(citations).values(
			Array.from({ length: 600 }, (_, i) => ({
				promptRunId: run.id,
				promptId: run.promptId,
				brandId: BRAND_ID,
				model: run.model,
				url: `https://many.example/page-${i}`,
				domain: "many.example",
				title: null,
				citationIndex: i,
				createdAt: new Date(run.createdAt),
			})),
		);
		const pages = await db.execute<{ pages: number }>(
			sql`SELECT count(DISTINCT (ctid::text::point)[0])::int AS pages FROM citations WHERE page_id IS NULL`,
		);
		expect(pages.rows[0].pages).toBeGreaterThan(1);

		expect(await resolveUnpagedCitations(db, { pagesPerStep: 1 })).toBe(600);

		const linked = await db.execute<{ unpaged: number; mismatched: number }>(sql`
			SELECT count(*) FILTER (WHERE c.page_id IS NULL)::int AS unpaged,
				count(*) FILTER (WHERE cp.url IS DISTINCT FROM c.url)::int AS mismatched
			FROM citations c LEFT JOIN cited_pages cp ON cp.id = c.page_id
			WHERE c.domain = 'many.example'
		`);
		expect(linked.rows[0]).toEqual({ unpaged: 0, mismatched: 0 });
		expect(await db.select().from(rollupDirty)).toEqual([expect.objectContaining({ brandId: BRAND_ID, bucket: B0 })]);
	});

	it("resumes an interrupted walk from where it got to", async () => {
		const run = SEED_RUNS[0];
		await db.insert(citations).values(
			Array.from({ length: 600 }, (_, i) => ({
				promptRunId: run.id,
				promptId: run.promptId,
				brandId: BRAND_ID,
				model: run.model,
				url: `https://resume.example/page-${i}`,
				domain: "resume.example",
				title: null,
				citationIndex: i,
				createdAt: new Date(run.createdAt),
			})),
		);
		let saved: HeapWalkPosition | null = null;
		const interrupted = resolveUnpagedCitations(db, {
			pagesPerStep: 1,
			onStep: async (position) => {
				saved = position;
				throw new Error("worker stopped");
			},
		});
		await expect(interrupted).rejects.toThrow("worker stopped");
		const firstWindow = await db.execute<{ linked: number }>(
			sql`SELECT count(*)::int AS linked FROM citations WHERE domain = 'resume.example' AND page_id IS NOT NULL`,
		);
		expect(firstWindow.rows[0].linked).toBeGreaterThan(0);
		expect(firstWindow.rows[0].linked).toBeLessThan(600);

		await resolveUnpagedCitations(db, { pagesPerStep: 1, from: saved });
		const left = await db.execute<{ unpaged: number }>(
			sql`SELECT count(*)::int AS unpaged FROM citations WHERE domain = 'resume.example' AND page_id IS NULL`,
		);
		expect(left.rows[0].unpaged).toBe(0);
	});

	it("refuses to guess when the pipeline state row is missing", async () => {
		await db.execute(sql`DELETE FROM pipeline_state`);
		await expect(getPipelineState(db)).rejects.toThrow(/run migrations/);
		await db.execute(sql`INSERT INTO pipeline_state (id) VALUES (1)`);
		await setPipelineState(db, { rollupVersion: 7 });
		expect((await getPipelineState(db)).rollupVersion).toBe(7);
	});

	describe("dirty marks", () => {
		const bucketsOf = (marks: { bucket: Date }[]) => marks.map((mark) => mark.bucket.toISOString());
		const brandMarks = () => db.select().from(rollupDirty).where(eq(rollupDirty.brandId, BRAND_ID));
		const B4 = new Date(B3.getTime() + BUCKET_MS);
		const wholeDay = { brandId: BRAND_ID, from: B0, toExclusive: B4 };

		it("lists pending marks newest bucket first, without taking them", async () => {
			await markDirty(db, BRAND_ID, [B0, B2, B1]);
			expect(bucketsOf(await pendingMarks(db, 2))).toEqual([B2.toISOString(), B1.toISOString()]);
			expect(bucketsOf(await pendingMarks(db, 10))).toEqual([B2, B1, B0].map((b) => b.toISOString()));
		});

		it("leaves out the marks a tick has already tried", async () => {
			await markDirty(db, BRAND_ID, [B0, B1, B2]);
			const [newest] = await pendingMarks(db, 1);
			expect(bucketsOf(await pendingMarks(db, 10, [newest]))).toEqual([B1.toISOString(), B0.toISOString()]);
		});

		it("keeps a bucket's first mark time when it is marked again", async () => {
			await markDirty(db, BRAND_ID, [B0]);
			const [first] = await brandMarks();
			await markDirty(db, BRAND_ID, [B0]);
			expect(await brandMarks()).toEqual([first]);
		});

		it("marks every bucket a prompt has runs in", async () => {
			expect(await markPromptRunsDirty(db, BRAND_ID, [PROMPT_2])).toBe(2);
			expect(bucketsOf(await pendingMarks(db, 10))).toEqual([B2.toISOString(), B0.toISOString()]);
		});

		it("marks every bucket with runs created since an instant", async () => {
			expect(await markRunsDirty(db, new Date("2026-01-15T10:15:00.000Z"))).toBe(2);
			expect(bucketsOf(await pendingMarks(db, 10))).toEqual([B2.toISOString(), B1.toISOString()]);
		});

		it("rebuilds a range and drops its marks in one commit", async () => {
			await markDirty(db, BRAND_ID, [B0, B2]);
			const refreshed = await refreshRange(db, wholeDay);
			expect(bucketsOf(refreshed?.marks ?? []).sort()).toEqual([B0.toISOString(), B2.toISOString()]);
			expect(await brandMarks()).toEqual([]);
			// B1 lies between two marks, so it is rebuilt with them.
			expect((await runRollupRows(db)).map((row) => row.bucket.toISOString())).toEqual([
				B0.toISOString(),
				B0.toISOString(),
				B1.toISOString(),
				B2.toISOString(),
			]);
			expect(await refreshRange(db, wholeDay)).toBeNull();
		});

		it("keeps the marks when the rebuild fails", async () => {
			await markDirty(db, BRAND_ID, [B0]);
			await rebuildAll(db);
			const before = await runRollupRows(db);
			await withRollupRowsLocked(() =>
				expect(refreshRange(impatient, wholeDay)).rejects.toMatchObject({ cause: { code: "55P03" } }),
			);
			expect(bucketsOf(await brandMarks())).toEqual([B0.toISOString()]);
			expect(await runRollupRows(db)).toEqual(before);
		});

		it("leaves a mark alone while a writer that re-marked it is still open", async () => {
			await markDirty(db, BRAND_ID, [B0]);
			let marked!: () => void;
			let release!: () => void;
			const hasMarked = new Promise<void>((resolve) => {
				marked = resolve;
			});
			const released = new Promise<void>((resolve) => {
				release = resolve;
			});
			const write = db.transaction(async (tx) => {
				await insertSeedRuns(tx, [{ ...SEED_RUNS[0], id: RUN(8), createdAt: "2026-01-15T10:02:00.000Z" }]);
				await markDirty(tx, BRAND_ID, [B0]);
				marked();
				await released;
			});
			await hasMarked;

			// Taking the mark now would rebuild B0 without the uncommitted run and lose it.
			expect(await refreshRange(db, wholeDay)).toBeNull();
			release();
			await write;

			expect(bucketsOf(await brandMarks())).toEqual([B0.toISOString()]);
			await refreshRange(db, wholeDay);
			const [row] = (await runRollupRows(db)).filter(
				(r) => r.promptId === PROMPT_1 && r.bucket.getTime() === B0.getTime(),
			);
			expect(row.runs).toBe(3);
		});

		it("re-marks a bucket written to while its rebuild is in flight", async () => {
			await markDirty(db, BRAND_ID, [B0]);
			await rebuildAll(db);
			await withRollupRowsLocked(async () => {
				// The refresh takes the mark, then stalls rebuilding with it uncommitted.
				const refresh = refreshRange(db, wholeDay);
				await waitForLockWaiters(1);
				const write = db.transaction(async (tx) => {
					await insertSeedRuns(tx, [{ ...SEED_RUNS[0], id: RUN(8), createdAt: "2026-01-15T10:02:00.000Z" }]);
					await markDirty(tx, BRAND_ID, [new Date("2026-01-15T10:02:00.000Z")]);
				});
				// The write now waits on the mark the refresh deleted.
				await waitForLockWaiters(2);
				return { refresh, write };
			}).then(async ({ refresh, write }) => {
				expect(bucketsOf((await refresh)?.marks ?? [])).toEqual([B0.toISOString()]);
				await write;
			});

			expect(await brandMarks()).toEqual([expect.objectContaining({ bucket: B0 })]);
			await refreshRange(db, wholeDay);
			const [row] = (await runRollupRows(db)).filter(
				(r) => r.promptId === PROMPT_1 && r.bucket.getTime() === B0.getTime(),
			);
			expect(row.runs).toBe(3);
		});

		it("leaves a brand another session is rewriting for the next tick", async () => {
			await markDirty(db, BRAND_ID, [B0]);
			await withBrandLocked(async () => {
				expect(await refreshRange(db, wholeDay)).toBeNull();
			});
			expect(bucketsOf(await brandMarks())).toEqual([B0.toISOString()]);
		});
	});
});
