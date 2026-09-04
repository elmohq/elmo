import * as schema from "@workspace/lib/db/schema";
import {
	brands,
	organization,
	pipelineState,
	promptRuns,
	prompts,
	rollupDirty,
	rollupPromptRuns,
} from "@workspace/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileRollupsJob, runReconcileTick } from "./jobs/reconcile-rollups";
import { refreshRollupsJob, runRefreshTick } from "./jobs/refresh-rollups";
import { runReprocess } from "./jobs/reprocess";

// These exercise the job orchestration (claim/coalesce/rebuild, reconcile
// sampling, reprocess batching) against a real Postgres instance. Every
// function under test takes its db connection explicitly, so none of this
// touches the `db`/`boss` singletons or needs a live pg-boss — only
// ROLLUP_TEST_DATABASE_URL. Run scoped to this package
// (`ROLLUP_TEST_DATABASE_URL=... pnpm --filter @workspace/worker test`) rather
// than from the repo root: this and packages/lib's own rollups integration
// suite both truncate shared tables, so they should not run concurrently
// against the same database.
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
		it("marks the trailing window dirty for a brand with a recent run and stamps last_reconcile_at", async () => {
			await insertRun(db, { id: RUN(3), createdAt: new Date() });

			await runReconcileTick("test", db);

			const marks = await db.select().from(rollupDirty).where(eq(rollupDirty.brandId, BRAND_ID));
			expect(marks.length).toBeGreaterThan(0);
			expect(marks.every((mark) => mark.reason === "reconcile")).toBe(true);

			const [state] = await db.select().from(pipelineState);
			expect(state.lastReconcileAt).not.toBeNull();
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

		it("skips a brand that no longer exists and still triggers a refresh", async () => {
			const sendBoss = fakeBoss();
			await expect(
				runReprocess({ layers: ["extraction"], brandId: "no-such-brand" }, db, sendBoss),
			).resolves.toBeUndefined();
			expect(sendBoss.send).toHaveBeenCalled();
		});
	});
});
