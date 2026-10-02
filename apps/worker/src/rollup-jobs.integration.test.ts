import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import * as schema from "@workspace/lib/db/schema";
import {
	brands,
	citations,
	competitors,
	organization,
	pipelineState,
	promptRuns,
	prompts,
	rollupCitationUrls,
	rollupCompetitorMentions,
	rollupDirty,
	rollupPromptRuns,
} from "@workspace/lib/db/schema";
import {
	BUCKET_MS,
	markDirty,
	ROLLUP_CATCH_UP_DELAY_SECONDS,
	ROLLUP_CATCH_UP_QUEUE,
	ROLLUP_VERSION,
} from "@workspace/lib/rollups";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refreshRollupsJob, runRefreshTick } from "./jobs/refresh-rollups";
import { runReprocess } from "./jobs/reprocess";
import { runRollupCatchUp } from "./jobs/rollup-catch-up";
import { initializePipeline } from "./rollups-startup";

// Bucket-aligned (a whole 30-minute mark from the date_bin origin).
const B0 = new Date("2026-02-01T10:00:00.000Z");
const B1 = new Date(B0.getTime() + BUCKET_MS);

/** Gives up on a lock quickly, which is how these tests make a rebuild fail. */
const impatient = drizzle({
	connection: { connectionString: process.env.DATABASE_URL, options: "-c lock_timeout=50" },
	schema,
});

interface Fixture {
	brandId: string;
	promptId: string;
}

const fixtures: Fixture[] = [];

async function createFixture(): Promise<Fixture> {
	const brandId = `brand-${randomUUID()}`;
	await db.insert(organization).values({ id: brandId, name: brandId, slug: brandId, createdAt: new Date() });
	await db.insert(brands).values({
		id: brandId,
		name: "Acme",
		website: "https://acme.test",
		organizationId: brandId,
		onboarded: true,
	});
	const [prompt] = await db.insert(prompts).values({ brandId, value: "best crm" }).returning({ id: prompts.id });
	const fixture = { brandId, promptId: prompt.id };
	fixtures.push(fixture);
	return fixture;
}

async function deleteFixture({ brandId }: Fixture): Promise<void> {
	for (const table of [rollupPromptRuns, rollupCompetitorMentions, rollupCitationUrls, rollupDirty]) {
		await db.delete(table).where(eq(table.brandId, brandId));
	}
	await db.delete(citations).where(eq(citations.brandId, brandId));
	await db.delete(promptRuns).where(eq(promptRuns.brandId, brandId));
	await db.delete(prompts).where(eq(prompts.brandId, brandId));
	await db.delete(competitors).where(eq(competitors.brandId, brandId));
	await db.delete(brands).where(eq(brands.id, brandId));
	await db.delete(organization).where(eq(organization.id, brandId));
}

function insertRun(
	fixture: Fixture,
	overrides: Partial<typeof promptRuns.$inferInsert> & { createdAt: Date },
): Promise<unknown> {
	return db.insert(promptRuns).values({
		promptId: fixture.promptId,
		brandId: fixture.brandId,
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

const marksOf = (brandId: string) => db.select().from(rollupDirty).where(eq(rollupDirty.brandId, brandId));
const rollupRunsOf = (brandId: string) =>
	db.select().from(rollupPromptRuns).where(eq(rollupPromptRuns.brandId, brandId));

async function withBrandLocked<T>(brandId: string, fn: () => Promise<T>): Promise<T> {
	const client = await db.$client.connect();
	try {
		await client.query("SELECT pg_advisory_lock(hashtext($1))", [brandId]);
		try {
			return await fn();
		} finally {
			await client.query("SELECT pg_advisory_unlock(hashtext($1))", [brandId]);
		}
	} finally {
		client.release();
	}
}

function fakeBoss() {
	return { send: vi.fn().mockResolvedValue("fake-job-id"), findJobs: vi.fn().mockResolvedValue([]) };
}

let fixture: Fixture;

beforeEach(async () => {
	fixture = await createFixture();
});

afterEach(async () => {
	while (fixtures.length) await deleteFixture(fixtures.pop() as Fixture);
});

afterAll(async () => {
	await impatient.$client.end();
	await db.$client.end();
});

describe("runRefreshTick", () => {
	it("rebuilds a marked bucket and drops the mark", async () => {
		await insertRun(fixture, { createdAt: B0 });
		await markDirty(db, fixture.brandId, [B0], "run");

		const result = await runRefreshTick({ source: "test" });

		expect(result.ranges).toBeGreaterThanOrEqual(1);
		expect((await rollupRunsOf(fixture.brandId)).map((row) => row.runs)).toEqual([1]);
		expect(await marksOf(fixture.brandId)).toEqual([]);
	});

	it("leaves marks in place when the time budget is already spent", async () => {
		await markDirty(db, fixture.brandId, [B0], "run");

		const result = await runRefreshTick({ timeBudgetMs: -60_000 });

		expect(result).toEqual({ ranges: 0, failed: 0, marksTaken: 0 });
		expect(await marksOf(fixture.brandId)).toHaveLength(1);
	});

	it("finishes the other ranges when one fails, and retries the failed one on a later tick", async () => {
		const stuck = fixture;
		const healthy = await createFixture();
		for (const f of [stuck, healthy]) {
			await insertRun(f, { createdAt: B0 });
			await markDirty(db, f.brandId, [B0], "run");
		}

		const result = await withBrandLocked(stuck.brandId, () => runRefreshTick({ source: "test" }, impatient));

		expect(result.failed).toBeGreaterThanOrEqual(1);
		expect(await rollupRunsOf(healthy.brandId)).toHaveLength(1);
		expect(await marksOf(healthy.brandId)).toEqual([]);
		expect(await rollupRunsOf(stuck.brandId)).toEqual([]);
		expect((await marksOf(stuck.brandId)).map((mark) => mark.bucket)).toEqual([B0]);

		await runRefreshTick({ source: "test" });
		expect(await rollupRunsOf(stuck.brandId)).toHaveLength(1);
		expect(await marksOf(stuck.brandId)).toEqual([]);
	});

	it("runs one tick per queued job", async () => {
		await insertRun(fixture, { createdAt: B0 });
		await markDirty(db, fixture.brandId, [B0], "run");

		await refreshRollupsJob([{ data: { source: "test" } } as never]);

		expect(await marksOf(fixture.brandId)).toEqual([]);
		expect(await rollupRunsOf(fixture.brandId)).toHaveLength(1);
	});
});

describe("rollup version changes", () => {
	it("marks every bucket with runs and schedules a catch-up, once", async () => {
		await insertRun(fixture, { createdAt: B0 });
		await insertRun(fixture, { createdAt: B1 });
		await db.update(pipelineState).set({ rollupVersion: 0 }).where(eq(pipelineState.id, 1));

		const boss = fakeBoss();
		const before = Date.now();
		await initializePipeline(boss);

		expect((await marksOf(fixture.brandId)).map((mark) => [mark.bucket, mark.reason])).toEqual(
			expect.arrayContaining([
				[B0, "backfill"],
				[B1, "backfill"],
			]),
		);
		expect(boss.send).toHaveBeenCalledTimes(1);
		const [queue, data, options] = boss.send.mock.calls[0];
		expect(queue).toBe(ROLLUP_CATCH_UP_QUEUE);
		expect(options).toEqual({ startAfter: ROLLUP_CATCH_UP_DELAY_SECONDS });
		expect(Date.parse(data.since)).toBeLessThan(before);
		expect((await db.select().from(pipelineState))[0].rollupVersion).toBe(ROLLUP_VERSION);

		await initializePipeline(boss);
		expect(boss.send).toHaveBeenCalledTimes(1);
	});

	it("catches up runs written after the full rebuild was requested", async () => {
		// Written by a worker still on the old version: no mark.
		await insertRun(fixture, { createdAt: B1 });
		await insertRun(fixture, { createdAt: B0 });

		await runRollupCatchUp({ since: new Date(B1.getTime() - 1).toISOString() });

		expect((await marksOf(fixture.brandId)).map((mark) => [mark.bucket, mark.reason])).toEqual([[B1, "catch-up"]]);
	});
});

describe("reprocess through to a refresh, after a competitor's domain changes", () => {
	it("re-marks the run's bucket so the rollup picks up the new mention", async () => {
		const { brandId } = fixture;
		// Domain strings deliberately share no substring with the competitor's own
		// name or with each other: mentionsSubject also matches on the bare name,
		// so a domain built from it (e.g. "globex-new.example") would flag the
		// competitor by name alone and the domain change below would test nothing.
		const [competitor] = await db
			.insert(competitors)
			.values({ brandId, name: "Globex", domains: ["oldsite.example"] })
			.returning({ id: competitors.id });

		await insertRun(fixture, {
			createdAt: B0,
			provider: "openai-api",
			brandMentioned: false,
			rawOutput: { choices: [{ message: { content: "According to newsite.example, Acme is the best CRM." } }] },
		});

		// Establishes a baseline stamp and text against the OLD domain, so the
		// second pass below is stale for one reason only: the domain change.
		await runReprocess({ layers: ["extraction", "interpretation"], brandId }, db, fakeBoss());
		await runRefreshTick({ source: "test" });
		const competitorRollup = () =>
			db
				.select({ name: rollupCompetitorMentions.competitorName, runs: rollupCompetitorMentions.runs })
				.from(rollupCompetitorMentions)
				.where(and(eq(rollupCompetitorMentions.brandId, brandId), eq(rollupCompetitorMentions.bucket, B0)));
		expect(await competitorRollup()).toEqual([]);

		await db
			.update(competitors)
			.set({ domains: ["newsite.example"] })
			.where(eq(competitors.id, competitor.id));
		await runReprocess({ layers: ["interpretation"], brandId }, db, fakeBoss());

		expect((await marksOf(brandId)).map((mark) => [mark.bucket, mark.reason])).toEqual([[B0, "reprocess"]]);

		await runRefreshTick({ source: "test" });

		expect(await competitorRollup()).toEqual([{ name: "Globex", runs: 1 }]);
		const [rollup] = (
			await db.execute(sql`
				SELECT sum(runs)::int AS runs, sum(no_mention_runs)::int AS no_mention
				FROM rollup_prompt_runs WHERE brand_id = ${brandId}
			`)
		).rows;
		expect(rollup).toEqual({ runs: 1, no_mention: 0 });
	});
});
