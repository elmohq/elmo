import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import {
	brands,
	citations,
	citedPages,
	organization,
	promptRuns,
	prompts,
	rollupCitationDomains,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupPromptRuns,
} from "../db/schema";
import { enqueueBackfill, finishBackfillIfDrained, rollupsReady } from "./backfill";
import { CLASSIFIER_VERSION } from "./constants";
import {
	claimDirty,
	coalesceMarks,
	markBrandRangeDirty,
	markDirty,
	markDirtyForTimestamps,
	restoreDirty,
} from "./dirty";
import { getPipelineState, setPipelineState } from "./pipeline-state";
import { rebuildRange } from "./rebuild";
import { reclassifyPages } from "./reclassify";
import { compareBucket } from "./reconcile";

const connectionString = process.env.ROLLUP_TEST_DATABASE_URL;

const connect = (url: string) => drizzle(url, { schema });
type TestDb = ReturnType<typeof connect>;

const ORG_ID = "org-rollups-test";
const BRAND_ID = "brand-rollups-test";
const PROMPT_1 = "aaaaaaaa-0000-4000-8000-000000000001";
const PROMPT_2 = "aaaaaaaa-0000-4000-8000-000000000002";
const RUN = (n: number) => `bbbbbbbb-0000-4000-8000-00000000000${n}`;

const B0 = new Date("2026-01-15T10:00:00.000Z");
const B1 = new Date("2026-01-15T10:30:00.000Z");
const B2 = new Date("2026-01-15T11:00:00.000Z");
const B3 = new Date("2026-01-15T11:30:00.000Z");

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
		createdAt: "2026-01-15T10:05:00.000Z",
		model: "gpt-5",
		provider: null,
		webSearchEnabled: false,
		brandMentioned: true,
		competitorsMentioned: ["Acme", "Globex"],
	},
	{
		id: RUN(2),
		promptId: PROMPT_1,
		createdAt: "2026-01-15T10:15:00.000Z",
		model: "gpt-5",
		provider: null,
		webSearchEnabled: false,
		brandMentioned: false,
		competitorsMentioned: [],
	},
	{
		id: RUN(3),
		promptId: PROMPT_2,
		createdAt: "2026-01-15T10:20:00.000Z",
		model: "gpt-5",
		provider: null,
		webSearchEnabled: false,
		brandMentioned: true,
		competitorsMentioned: ["Acme"],
	},
	{
		id: RUN(4),
		promptId: PROMPT_1,
		createdAt: "2026-01-15T10:35:00.000Z",
		model: "gpt-5",
		provider: "openai-api",
		webSearchEnabled: true,
		brandMentioned: true,
		competitorsMentioned: ["Acme"],
	},
	{
		id: RUN(5),
		promptId: PROMPT_2,
		createdAt: "2026-01-15T11:10:00.000Z",
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
			rollup_prompt_runs, rollup_competitor_mentions, rollup_citation_urls,
			rollup_citation_domains, cited_pages, rollup_dirty
		RESTART IDENTITY CASCADE
	`);
	await db.execute(sql`INSERT INTO pipeline_state (id) VALUES (1) ON CONFLICT DO NOTHING`);
	await db.execute(sql`
		UPDATE pipeline_state
		SET backfill_enqueued_at = NULL, backfill_completed_at = NULL, last_reconcile_at = NULL,
			rollup_version = 0, classifier_version = 0, extractor_version = 0, deriver_versions = '{}'
	`);
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
	await insertRuns(db, SEED_RUNS);
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
}

function insertRuns(db: TestDb, runs: SeedRun[]) {
	return db.insert(promptRuns).values(
		runs.map((run) => ({
			id: run.id,
			promptId: run.promptId,
			brandId: BRAND_ID,
			model: run.model,
			provider: run.provider,
			version: "1",
			webSearchEnabled: run.webSearchEnabled,
			rawOutput: { text: "seed" },
			brandMentioned: run.brandMentioned,
			competitorsMentioned: run.competitorsMentioned,
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

const domainRows = (db: TestDb) =>
	db
		.select()
		.from(rollupCitationDomains)
		.orderBy(asc(rollupCitationDomains.bucket), asc(rollupCitationDomains.promptId), asc(rollupCitationDomains.domain));

const pageRows = (db: TestDb) => db.select().from(citedPages).orderBy(asc(citedPages.url));

async function snapshot(db: TestDb) {
	return {
		runs: await runRollupRows(db),
		competitors: await competitorRows(db),
		urls: await urlRows(db),
		domains: await domainRows(db),
		pages: await pageRows(db),
	};
}

const rebuildAll = (db: TestDb) => rebuildRange(db, BRAND_ID, B0, B3);

describe.skipIf(!connectionString)("rollups against postgres", () => {
	let db: TestDb;

	beforeAll(() => {
		db = connect(connectionString as string);
	});

	afterAll(async () => {
		await db.$client.end();
	});

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
			},
		]);
		const first = rows[0];
		expect(first.firstRunAt.toISOString()).toBe("2026-01-15T10:05:00.000Z");
		expect(first.lastRunAt.toISOString()).toBe("2026-01-15T10:15:00.000Z");
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
		expect(stats).toMatchObject({ urlRows: 6, domainRows: 6, pages: 4 });

		const pages = await pageRows(db);
		expect(
			pages.map((page) => [page.url, page.title, page.staticCategory, page.pageType, page.classifierVersion]),
		).toEqual([
			["https://docs.example.com/api", null, "other", "doc", 1],
			[GUIDE, "New guide title", "editorial", "howto", 1],
			["https://google.com/search?q=best+crm", "best crm", "google", "search", 1],
			// The domain is unlisted, so the page type is what makes this editorial.
			["https://other.com/post", "Post", "editorial", "article", 1],
		]);

		const guide = pages.find((page) => page.url === GUIDE);
		expect(guide?.firstSeenAt.toISOString()).toBe("2026-01-15T10:05:00.000Z");
		expect(guide?.lastSeenAt.toISOString()).toBe("2026-01-15T11:10:00.000Z");

		const urls = await urlRows(db);
		const guideRow = urls.find(
			(row) => row.bucket.getTime() === B0.getTime() && row.promptId === PROMPT_1 && row.pageId === guide?.id,
		);
		expect(guideRow).toMatchObject({ pageId: guide?.id, citations: 2, positionSum: 0, positionCount: 2 });
		expect(urls.reduce((total, row) => total + row.citations, 0)).toBe(SEED_CITATIONS.length);
	});

	it("keeps domain rows at the same total as the raw citations", async () => {
		await rebuildAll(db);
		const rows = await domainRows(db);
		expect(rows.map((r) => [r.bucket.toISOString(), r.promptId, r.domain, r.staticCategory, r.citations])).toEqual([
			[B0.toISOString(), PROMPT_1, "docs.example.com", "other", 1],
			[B0.toISOString(), PROMPT_1, "example.com", "other", 2],
			[B0.toISOString(), PROMPT_1, "google.com", "google", 1],
			[B0.toISOString(), PROMPT_2, "example.com", "other", 1],
			// Domain rows classify by domain alone, so the page-type fallback that
			// makes other.com/post editorial does not apply here.
			[B1.toISOString(), PROMPT_1, "other.com", "other", 1],
			[B2.toISOString(), PROMPT_2, "example.com", "other", 1],
		]);
		expect(rows.reduce((total, row) => total + row.citations, 0)).toBe(SEED_CITATIONS.length);
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

		await insertRuns(db, [
			{
				id: RUN(6),
				promptId: PROMPT_2,
				createdAt: "2026-01-15T11:20:00.000Z",
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

	it("reports no drift between the rollups and the raw rows", async () => {
		await rebuildAll(db);
		for (const [from, toExclusive] of [
			[B0, B1],
			[B1, B2],
			[B2, B3],
			[B0, B3],
		]) {
			const comparison = await compareBucket(db, BRAND_ID, from, toExclusive);
			expect(comparison.runs[0]).toBe(comparison.runs[1]);
			expect(comparison.brandMentioned[0]).toBe(comparison.brandMentioned[1]);
			expect(comparison.citations[0]).toBe(comparison.citations[1]);
		}
		expect(await compareBucket(db, BRAND_ID, B0, B3)).toEqual({
			runs: [5, 5],
			brandMentioned: [3, 3],
			citations: [7, 7],
		});
	});

	it("notices drift when a bucket is left stale", async () => {
		await rebuildAll(db);
		await insertRuns(db, [
			{
				id: RUN(7),
				promptId: PROMPT_1,
				createdAt: "2026-01-15T10:06:00.000Z",
				model: "gpt-5",
				provider: null,
				webSearchEnabled: false,
				brandMentioned: true,
				competitorsMentioned: [],
			},
		]);
		expect(await compareBucket(db, BRAND_ID, B0, B1)).toMatchObject({ runs: [3, 4] });
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

	it("marks the buckets a brand actually has runs in", async () => {
		expect(await markBrandRangeDirty(db, BRAND_ID, B0, B2, "reconcile")).toBe(2);
		expect((await claimDirty(db, 10)).map((mark) => mark.bucket.toISOString())).toEqual([
			B1.toISOString(),
			B0.toISOString(),
		]);

		expect(await markBrandRangeDirty(db, "other-brand", B0, B3, "reconcile")).toBe(0);
		expect(await claimDirty(db, 10)).toEqual([]);
	});

	it("marks the buckets timestamps fall in", async () => {
		await markDirtyForTimestamps(
			db,
			BRAND_ID,
			[new Date("2026-01-15T10:05:00.000Z"), new Date("2026-01-15T10:29:59.999Z"), B1],
			"reprocess",
		);
		expect((await claimDirty(db, 10)).map((mark) => mark.bucket.toISOString())).toEqual([
			B1.toISOString(),
			B0.toISOString(),
		]);
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
			["other", "doc"],
			["editorial", "howto"],
			["google", "search"],
			["editorial", "article"],
		]);
	});

	it("refuses to guess when the pipeline state row is missing", async () => {
		await db.execute(sql`DELETE FROM pipeline_state`);
		await expect(getPipelineState(db)).rejects.toThrow(/run migrations/);
		await db.execute(sql`INSERT INTO pipeline_state (id) VALUES (1)`);
		await setPipelineState(db, { lastReconcileAt: B0 });
		expect((await getPipelineState(db)).lastReconcileAt?.toISOString()).toBe(B0.toISOString());
	});

	it("round-trips dirty marks newest bucket first", async () => {
		await markDirty(db, BRAND_ID, [B0, B2, B1], "run");
		await markDirty(db, BRAND_ID, [B0], "reprocess");

		const claimed = await claimDirty(db, 2);
		expect(claimed.map((mark) => mark.bucket.toISOString())).toEqual([B2.toISOString(), B1.toISOString()]);
		expect(claimed[0]).toMatchObject({ brandId: BRAND_ID, reason: "run" });

		const rest = await claimDirty(db, 10);
		// The second mark for B0 collapsed into the first, keeping its reason.
		expect(rest.map((mark) => [mark.bucket.toISOString(), mark.reason])).toEqual([[B0.toISOString(), "run"]]);
		expect(await claimDirty(db, 10)).toEqual([]);

		await restoreDirty(db, [...claimed, ...rest]);
		const reclaimed = await claimDirty(db, 10);
		expect(reclaimed.map((mark) => mark.bucket.toISOString())).toEqual([
			B2.toISOString(),
			B1.toISOString(),
			B0.toISOString(),
		]);
	});

	it("rebuilds the ranges a claim coalesces into", async () => {
		await markDirty(db, BRAND_ID, [B0, B1, B2], "run");
		const ranges = coalesceMarks(await claimDirty(db, 10));
		expect(ranges).toHaveLength(1);

		const [range] = ranges;
		await rebuildRange(db, range.brandId, range.from, range.toExclusive);
		expect(await compareBucket(db, BRAND_ID, B0, B3)).toMatchObject({ runs: [5, 5] });
	});

	it("enqueues a backfill once and completes it when the marks drain", async () => {
		expect(await rollupsReady(db)).toBe(false);
		expect(await enqueueBackfill(db)).toBe(true);
		expect(await enqueueBackfill(db)).toBe(false);

		const state = await getPipelineState(db);
		expect(state.backfillEnqueuedAt).not.toBeNull();
		expect(state.backfillCompletedAt).toBeNull();

		expect(await finishBackfillIfDrained(db)).toBe(false);

		const claimed = await claimDirty(db, 100);
		expect(claimed.map((mark) => mark.bucket.toISOString()).sort()).toEqual([
			B0.toISOString(),
			B1.toISOString(),
			B2.toISOString(),
		]);
		expect(claimed.every((mark) => mark.reason === "backfill")).toBe(true);

		expect(await finishBackfillIfDrained(db)).toBe(true);
		expect(await finishBackfillIfDrained(db)).toBe(false);
		expect(await rollupsReady(db)).toBe(true);
	});

	it("does not complete a backfill while any of its marks remain", async () => {
		await enqueueBackfill(db);
		const claimed = await claimDirty(db, 1);
		await markDirty(db, BRAND_ID, [B3], "run");
		expect(await finishBackfillIfDrained(db)).toBe(false);

		await restoreDirty(db, claimed);
		await claimDirty(db, 100);
		expect(await finishBackfillIfDrained(db)).toBe(true);
	});
});
