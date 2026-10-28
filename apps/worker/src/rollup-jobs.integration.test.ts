import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { insertRuns, type NewRun } from "@workspace/lib/db/runs";
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
import { deriveQueue } from "./jobs/__fixtures__/derive-queue";
import { refreshRollupsJob, runRefreshTick } from "./jobs/refresh-rollups";
import { type ReprocessData, runReprocess } from "./jobs/reprocess";
import { runRollupCatchUp } from "./jobs/rollup-catch-up";
import { cuedAnalyzer } from "./mention-judge/__fixtures__/cued-judge";
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

function insertRun(fixture: Fixture, overrides: Partial<NewRun> & { createdAt: Date }): Promise<unknown> {
	return insertRuns(db, [
		{
			promptId: fixture.promptId,
			brandId: fixture.brandId,
			model: "gpt-5",
			provider: null,
			version: "1",
			webSearchEnabled: false,
			rawOutput: { text: "seed" },
			mentions: { brandMentioned: true, competitorsMentioned: [], assessments: null, stamp: null },
			...overrides,
		},
	]);
}

const marksOf = (brandId: string) => db.select().from(rollupDirty).where(eq(rollupDirty.brandId, brandId));
const rollupRunsOf = (brandId: string) =>
	db.select().from(rollupPromptRuns).where(eq(rollupPromptRuns.brandId, brandId));

/** Holds a brand's rollup rows from another session, so a rebuild of it stalls at its first delete. */
async function withRollupRowsLocked<T>(brandId: string, fn: () => Promise<T>): Promise<T> {
	const client = await db.$client.connect();
	try {
		await client.query("BEGIN");
		await client.query("SELECT 1 FROM rollup_prompt_runs WHERE brand_id = $1 FOR UPDATE", [brandId]);
		try {
			return await fn();
		} finally {
			await client.query("ROLLBACK");
		}
	} finally {
		client.release();
	}
}

function fakeBoss() {
	return {
		send: vi.fn().mockResolvedValue("fake-job-id"),
		update: vi.fn(),
		insert: vi.fn(),
		findJobs: vi.fn().mockResolvedValue([]),
	};
}

/** A whole replay: the pass queues the brand's stale runs, and the derivation workers take them. */
async function replay(data: ReprocessData) {
	const queue = deriveQueue(db, cuedAnalyzer, null);
	await runReprocess(data, db, queue.boss, cuedAnalyzer, null);
	await queue.drain();
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
		await markDirty(db, fixture.brandId, [B0]);

		const result = await runRefreshTick({ source: "test" });

		expect(result.ranges).toBeGreaterThanOrEqual(1);
		expect((await rollupRunsOf(fixture.brandId)).map((row) => row.runs)).toEqual([1]);
		expect(await marksOf(fixture.brandId)).toEqual([]);
	});

	it("leaves marks in place when the time budget is already spent", async () => {
		await markDirty(db, fixture.brandId, [B0]);

		const result = await runRefreshTick({ timeBudgetMs: -60_000 });

		expect(result).toEqual({ ranges: 0, failed: 0, marksTaken: 0 });
		expect(await marksOf(fixture.brandId)).toHaveLength(1);
	});

	it("finishes the other ranges when one fails, and retries the failed one on a later tick", async () => {
		const stuck = fixture;
		const healthy = await createFixture();
		await insertRun(stuck, { createdAt: B0 });
		await markDirty(db, stuck.brandId, [B0]);
		await runRefreshTick({ source: "test" });
		for (const f of [stuck, healthy]) {
			await insertRun(f, { createdAt: B0 });
			await markDirty(db, f.brandId, [B0]);
		}
		const runsOf = async (brandId: string) => (await rollupRunsOf(brandId)).map((row) => row.runs);

		const result = await withRollupRowsLocked(stuck.brandId, () => runRefreshTick({ source: "test" }, impatient));

		expect(result.failed).toBeGreaterThanOrEqual(1);
		expect(await runsOf(healthy.brandId)).toEqual([1]);
		expect(await marksOf(healthy.brandId)).toEqual([]);
		expect(await runsOf(stuck.brandId)).toEqual([1]);
		expect((await marksOf(stuck.brandId)).map((mark) => mark.bucket)).toEqual([B0]);

		await runRefreshTick({ source: "test" });
		expect(await runsOf(stuck.brandId)).toEqual([2]);
		expect(await marksOf(stuck.brandId)).toEqual([]);
	});

	it("runs one tick per queued job", async () => {
		await insertRun(fixture, { createdAt: B0 });
		await markDirty(db, fixture.brandId, [B0]);

		await refreshRollupsJob([{ data: { source: "test" } } as never]);

		expect(await marksOf(fixture.brandId)).toEqual([]);
		expect(await rollupRunsOf(fixture.brandId)).toHaveLength(1);
	});
});

describe("rollup version changes", () => {
	it("queues a full mark and a delayed catch-up until the full mark lands", async () => {
		await insertRun(fixture, { createdAt: B0 });
		await insertRun(fixture, { createdAt: B1 });
		await db.update(pipelineState).set({ rollupVersion: 0 }).where(eq(pipelineState.id, 1));

		const boss = fakeBoss();
		const before = Date.now();
		await initializePipeline(boss);

		expect(boss.send.mock.calls.map(([queue]) => queue)).toEqual([ROLLUP_CATCH_UP_QUEUE, ROLLUP_CATCH_UP_QUEUE]);
		const [[, rebuild], [, catchUp, catchUpOptions]] = boss.send.mock.calls;
		expect(catchUpOptions).toEqual({ startAfter: ROLLUP_CATCH_UP_DELAY_SECONDS });
		expect(Date.parse(catchUp.since)).toBeLessThan(before);
		expect((await db.select().from(pipelineState))[0].rollupVersion).toBe(0);

		await runRollupCatchUp(rebuild);
		expect((await marksOf(fixture.brandId)).map((mark) => mark.bucket)).toEqual(expect.arrayContaining([B0, B1]));
		expect((await db.select().from(pipelineState))[0].rollupVersion).toBe(ROLLUP_VERSION);
		expect(await runRollupCatchUp(rebuild)).toBe(0);

		await initializePipeline(boss);
		expect(boss.send).toHaveBeenCalledTimes(2);
	});

	it("catches up runs written after the full rebuild was requested", async () => {
		// Written by a worker still on the old version: no mark.
		await insertRun(fixture, { createdAt: B1 });
		await insertRun(fixture, { createdAt: B0 });

		await runRollupCatchUp({ since: new Date(B1.getTime() - 1).toISOString() });

		expect((await marksOf(fixture.brandId)).map((mark) => mark.bucket)).toEqual([B1]);
	});
});

describe("reprocess through to a refresh, after a competitor's domain changes", () => {
	it("re-marks the run's bucket so the rollup picks up the new mention", async () => {
		const { brandId } = fixture;
		// Domain strings deliberately share no substring with the competitor's own
		// name or with each other: the judge also reads the bare name,
		// so a domain built from it (e.g. "globex-new.example") would flag the
		// competitor by name alone and the domain change below would test nothing.
		const [competitor] = await db
			.insert(competitors)
			.values({ brandId, name: "Globex", domains: ["oldsite.example"] })
			.returning({ id: competitors.id });

		await insertRun(fixture, {
			createdAt: B0,
			provider: "openai-api",
			mentions: { brandMentioned: false, competitorsMentioned: [], assessments: null, stamp: null },
			rawOutput: { choices: [{ message: { content: "According to newsite.example, Acme is the best CRM." } }] },
		});

		// Establishes a baseline stamp and text against the OLD domain, so the
		// second pass below is stale for one reason only: the domain change.
		await replay({ layers: ["extraction", "interpretation"], brandId });
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
		await replay({ layers: ["interpretation"], brandId });

		expect((await marksOf(brandId)).map((mark) => mark.bucket)).toEqual([B0]);

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
