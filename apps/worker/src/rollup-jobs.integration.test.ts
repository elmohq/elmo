import * as schema from "@workspace/lib/db/schema";
import {
	brands,
	competitors,
	organization,
	pipelineState,
	promptRuns,
	prompts,
	rollupDirty,
	rollupPromptRuns,
} from "@workspace/lib/db/schema";
import { compareBucket } from "@workspace/lib/rollups";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileRollupsJob, runReconcileTick } from "./jobs/reconcile-rollups";
import { refreshRollupsJob, runRefreshTick } from "./jobs/refresh-rollups";
import { requestStaleReprocesses, runReprocess } from "./jobs/reprocess";

// Don't run this concurrently with packages/lib's rollups integration suite
// against the same database: both truncate shared tables.
const connectionString = process.env.ROLLUP_TEST_DATABASE_URL;

const connect = (url: string) => drizzle(url, { schema });
type TestDb = ReturnType<typeof connect>;

const ORG_ID = "org-worker-rollups-test";
const BRAND_ID = "brand-worker-rollups-test";
const PROMPT_1 = "eeeeeeee-0000-4000-8000-000000000001";
const RUN = (n: number) => `eeeeeeee-0000-4000-8000-00000000000${n}`;

// Bucket-aligned (a whole 30-minute mark from the date_bin origin).
const B0 = new Date("2026-02-01T10:00:00.000Z");

async function reset(db: TestDb): Promise<void> {
	await db.execute(sql`
		TRUNCATE citations, prompt_runs, prompts, competitors, brands, organization,
			rollup_prompt_runs, rollup_competitor_mentions, rollup_citation_urls, cited_pages, rollup_dirty
		RESTART IDENTITY CASCADE
	`);
	await db.execute(sql`INSERT INTO pipeline_state (id) VALUES (1) ON CONFLICT DO NOTHING`);
	await db.execute(sql`
		UPDATE pipeline_state
		SET backfill_enqueued_at = NULL, backfill_completed_at = NULL, rollup_version = 0, classifier_version = 0
	`);
}

async function seedBrand(db: TestDb): Promise<void> {
	await db.insert(organization).values({
		id: ORG_ID,
		name: "Worker Rollups Test Org",
		slug: "worker-rollups-test-org",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
	});
	await db.insert(brands).values({ id: BRAND_ID, name: "Acme", website: "https://acme.test", organizationId: ORG_ID });
	await db.insert(prompts).values({ id: PROMPT_1, brandId: BRAND_ID, value: "best crm" });
}

function insertRun(
	db: TestDb,
	overrides: Partial<typeof promptRuns.$inferInsert> & { id: string; createdAt: Date },
): Promise<unknown> {
	return db.insert(promptRuns).values({
		promptId: PROMPT_1,
		brandId: BRAND_ID,
		model: "gpt-5",
		provider: null,
		version: "1",
		webSearchEnabled: false,
		rawOutput: { text: "seed" },
		brandMentioned: true,
		competitorsMentioned: [],
		...overrides,
	});
}

function fakeBoss() {
	return { send: vi.fn().mockResolvedValue("fake-job-id") };
}

describe.skipIf(!connectionString)("worker rollup jobs against postgres", () => {
	let db: TestDb;

	beforeAll(() => {
		db = connect(connectionString as string);
	});

	afterAll(async () => {
		await db.$client.end();
	});

	beforeEach(async () => {
		await reset(db);
		await seedBrand(db);
	});

	describe("runRefreshTick", () => {
		it("drains a dirty mark, rebuilds it, and completes a fully-drained backfill", async () => {
			await insertRun(db, { id: RUN(1), createdAt: B0 });
			await db.update(pipelineState).set({ backfillEnqueuedAt: new Date() }).where(eq(pipelineState.id, 1));
			await db.insert(rollupDirty).values({ brandId: BRAND_ID, bucket: B0, reason: "backfill" });

			const result = await runRefreshTick({}, db);

			expect(result).toEqual({ ranges: 1, failed: 0, marksClaimed: 1 });
			const rows = await db.select().from(rollupPromptRuns).where(eq(rollupPromptRuns.brandId, BRAND_ID));
			expect(rows).toHaveLength(1);
			expect(rows[0].runs).toBe(1);
			expect(await db.select().from(rollupDirty)).toHaveLength(0);

			const [state] = await db.select().from(pipelineState);
			expect(state.backfillCompletedAt).not.toBeNull();
		});

		it("claims nothing and leaves marks in place when the time budget is already spent", async () => {
			await db.insert(rollupDirty).values({ brandId: BRAND_ID, bucket: B0, reason: "run" });

			const result = await runRefreshTick({ timeBudgetMs: -60_000 }, db);

			expect(result).toEqual({ ranges: 0, failed: 0, marksClaimed: 0 });
			expect(await db.select().from(rollupDirty)).toHaveLength(1);
		});

		it("refreshRollupsJob runs one tick per queued job", async () => {
			await db.insert(rollupDirty).values({ brandId: BRAND_ID, bucket: B0, reason: "run" });
			await insertRun(db, { id: RUN(2), createdAt: B0 });

			await refreshRollupsJob([{ data: { source: "test" } } as never]);

			expect(await db.select().from(rollupDirty)).toHaveLength(0);
			expect(await db.select().from(rollupPromptRuns).where(eq(rollupPromptRuns.brandId, BRAND_ID))).toHaveLength(1);
		});
	});

	describe("runReconcileTick", () => {
		it("marks the trailing window dirty for a brand with a recent run", async () => {
			await insertRun(db, { id: RUN(3), createdAt: new Date() });

			await runReconcileTick("test", db);

			const marks = await db.select().from(rollupDirty).where(eq(rollupDirty.brandId, BRAND_ID));
			expect(marks.length).toBeGreaterThan(0);
			expect(marks.every((mark) => mark.reason === "reconcile")).toBe(true);
		});

		it("flags and marks a sampled bucket whose rollup has drifted from raw", async () => {
			// Well outside the trailing 48h window, so it is only caught by sampling.
			const old = new Date("2026-01-01T10:00:00.000Z");
			await insertRun(db, { id: RUN(4), createdAt: old });
			// A rollup row that disagrees with the raw run above: claims zero runs happened.
			await db.insert(rollupPromptRuns).values({
				brandId: BRAND_ID,
				bucket: old,
				promptId: PROMPT_1,
				model: "gpt-5",
				provider: "",
				webSearchEnabled: false,
				runs: 0,
				brandMentionedRuns: 0,
				competitorRuns: 0,
				competitorMentions: 0,
				firstRunAt: old,
				lastRunAt: old,
			});

			await reconcileRollupsJob([{ data: { source: "test" } } as never]);

			const marks = await db.select().from(rollupDirty).where(eq(rollupDirty.bucket, old));
			expect(marks.map((mark) => mark.reason)).toEqual(["reconcile"]);
		});
	});

	describe("runReprocess", () => {
		it("extracts text, derives mentions, marks the touched bucket dirty, and triggers a refresh", async () => {
			await insertRun(db, {
				id: RUN(5),
				createdAt: B0,
				provider: "openai-api",
				brandMentioned: false,
				rawOutput: { choices: [{ message: { content: "Acme is the best CRM." } }] },
			});

			const sendBoss = fakeBoss();
			await runReprocess({ layers: ["extraction", "interpretation"], brandId: BRAND_ID }, db, sendBoss);

			const [row] = await db
				.select()
				.from(promptRuns)
				.where(eq(promptRuns.id, RUN(5)));
			expect(row.textContent).toBe("Acme is the best CRM.");
			expect(row.extractorVersion).toBe(1);
			expect(row.brandMentioned).toBe(true);
			expect(row.analysisVersions.mentions).toBeDefined();

			const marks = await db.select().from(rollupDirty).where(eq(rollupDirty.bucket, B0));
			expect(marks.map((mark) => mark.reason)).toEqual(["reprocess"]);

			expect(sendBoss.send).toHaveBeenCalledWith(
				"refresh-rollups",
				{ source: "reprocess" },
				expect.objectContaining({ singletonKey: "refresh-rollups" }),
			);
		});

		it("is a no-op the second time a row is already current", async () => {
			await insertRun(db, {
				id: RUN(6),
				createdAt: B0,
				provider: "openai-api",
				rawOutput: { choices: [{ message: { content: "Acme is the best CRM." } }] },
			});

			await runReprocess({ layers: ["extraction", "interpretation"], brandId: BRAND_ID }, db, fakeBoss());
			expect(await db.select().from(rollupDirty)).toHaveLength(1);
			await db.delete(rollupDirty);

			await runReprocess({ layers: ["extraction", "interpretation"], brandId: BRAND_ID }, db, fakeBoss());
			expect(await db.select().from(rollupDirty)).toHaveLength(0);
		});

		it("skips a brand that no longer exists", async () => {
			await expect(
				runReprocess({ layers: ["extraction"], brandId: "no-such-brand" }, db, fakeBoss()),
			).resolves.toBeUndefined();
		});

		it("records the stamps the brand's history was brought to", async () => {
			await runReprocess({ layers: ["interpretation"], brandId: BRAND_ID }, db, fakeBoss());
			const [brand] = await db.select().from(brands).where(eq(brands.id, BRAND_ID));
			expect(Object.keys(brand.analysisVersions)).toEqual(["mentions"]);
		});
	});

	describe("requestStaleReprocesses", () => {
		const sentBrands = (sendBoss: ReturnType<typeof fakeBoss>) =>
			sendBoss.send.mock.calls.map(([, data]) => [data.brandId, data.layers]);

		it("adopts today's stamps for a brand that predates the rollups", async () => {
			await db.update(pipelineState).set({ backfillEnqueuedAt: new Date() }).where(eq(pipelineState.id, 1));
			const sendBoss = fakeBoss();
			expect(await requestStaleReprocesses(db, sendBoss)).toBe(0);
			expect(sendBoss.send).not.toHaveBeenCalled();
			expect(await requestStaleReprocesses(db, sendBoss)).toBe(0);
		});

		it("requests a reprocess once a brand's config moves, and stops once it has run", async () => {
			const sendBoss = fakeBoss();
			expect(await requestStaleReprocesses(db, sendBoss)).toBe(1);
			expect(sentBrands(sendBoss)).toEqual([[BRAND_ID, ["extraction", "interpretation"]]]);

			await runReprocess({ brandId: BRAND_ID, layers: ["extraction", "interpretation"] }, db, fakeBoss());
			expect(await requestStaleReprocesses(db, fakeBoss())).toBe(0);

			await db.insert(competitors).values({ brandId: BRAND_ID, name: "Globex", domains: ["globex.test"] });
			const afterEdit = fakeBoss();
			expect(await requestStaleReprocesses(db, afterEdit)).toBe(1);
			expect(sentBrands(afterEdit)).toEqual([[BRAND_ID, ["interpretation"]]]);
		});
	});

	// Lives here rather than in apps/web because refresh-rollups.ts imports
	// @sentry/node, which apps/web can't resolve; for the same reason the share
	// of voice checks reproduce getPerPromptDailyCompetitorMentions in SQL.
	describe("runReprocess through to a refresh, after a competitor's domain changes", () => {
		it("restamps analysis, updates competitors_mentioned, marks the bucket dirty, and matches raw once refreshed", async () => {
			// Domain strings deliberately share no substring with the competitor's own
			// name or with each other: mentionsSubject also matches on the bare name,
			// so a domain built from it (e.g. "globex-new.example") would flag the
			// competitor by name alone and the domain change below would test nothing.
			const [competitor] = await db
				.insert(competitors)
				.values({ brandId: BRAND_ID, name: "Globex", domains: ["oldsite.example"] })
				.returning({ id: competitors.id });

			await insertRun(db, {
				id: RUN(7),
				createdAt: B0,
				provider: "openai-api",
				brandMentioned: false,
				rawOutput: { choices: [{ message: { content: "According to newsite.example, Acme is the best CRM." } }] },
			});

			// Establishes a baseline stamp and text against the OLD domain, so the
			// second pass below is stale for one reason only: the domain change.
			await runReprocess({ layers: ["extraction", "interpretation"], brandId: BRAND_ID }, db, fakeBoss());
			const [before] = await db
				.select()
				.from(promptRuns)
				.where(eq(promptRuns.id, RUN(7)));
			expect(before.competitorsMentioned).toEqual([]);
			const stampBefore = before.analysisVersions.mentions;
			expect(stampBefore).toBeDefined();
			await db.delete(rollupDirty);

			await db
				.update(competitors)
				.set({ domains: ["newsite.example"] })
				.where(eq(competitors.id, competitor.id));
			await runReprocess({ layers: ["interpretation"], brandId: BRAND_ID }, db, fakeBoss());

			const [after] = await db
				.select()
				.from(promptRuns)
				.where(eq(promptRuns.id, RUN(7)));
			expect(after.competitorsMentioned).toEqual(["Globex"]);
			expect(after.analysisVersions.mentions).not.toBe(stampBefore);

			const marks = await db.select().from(rollupDirty).where(eq(rollupDirty.bucket, B0));
			expect(marks.map((mark) => mark.reason)).toEqual(["reprocess"]);

			await runRefreshTick({ source: "test" }, db);

			const bucketEnd = new Date(B0.getTime() + 30 * 60 * 1000);
			const comparison = await compareBucket(db, BRAND_ID, B0, bucketEnd);
			expect(comparison.runs[0]).toBe(comparison.runs[1]);
			expect(comparison.brandMentioned[0]).toBe(comparison.brandMentioned[1]);

			const rollupMentions = await db.execute(sql`
				SELECT competitor_name, sum(runs)::int AS mentions
				FROM rollup_competitor_mentions
				WHERE brand_id = ${BRAND_ID}
				GROUP BY competitor_name
			`);
			const rawMentions = await db.execute(sql`
				SELECT competitor, count(*)::int AS mentions
				FROM prompt_runs, unnest(competitors_mentioned) AS competitor
				WHERE brand_id = ${BRAND_ID}
				GROUP BY competitor
			`);
			expect(rollupMentions.rows).toEqual([{ competitor_name: "Globex", mentions: 1 }]);
			expect(rawMentions.rows).toEqual([{ competitor: "Globex", mentions: 1 }]);
		});
	});
});
