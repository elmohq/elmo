/**
 * Runs against the disposable E2E test database: `pnpm -C apps/web
 * test:integration` with DATABASE_URL pointing at it.
 *
 * An import is all-or-nothing and only ever what was reviewed: ten thousand
 * lines land in one transaction, a review of a catalog that has since changed
 * is refused, a failure in the middle leaves no row behind, and disabled
 * imports queue no work.
 */
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL must point at the seeded test stack");

const TEST_BRAND_ID = "default";
const MARKER_TAG = "pmt10k-it-import";
const SENTINEL = "PMT-10K import sentinel — trigger rejects me";

const { commitPromptImport, reviewPromptImport } = await import("@/server/prompt-import-load");
const { scheduleFirstPromptRuns } = await import("@/lib/job-scheduler");
const { getBoss } = await import("@/lib/boss-client");
const { MAX_PROMPTS } = await import("@workspace/lib/constants");
const { db } = await import("@workspace/lib/db/db");
const { brands } = await import("@workspace/lib/db/schema");
const { eq } = await import("drizzle-orm");

const client = new pg.Client({ connectionString: DATABASE_URL });

async function brandCount(): Promise<number> {
	const { rows } = await client.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM prompts WHERE brand_id = $1", [
		TEST_BRAND_ID,
	]);
	return rows[0].n;
}

async function markerRows(): Promise<{ id: string; value: string; enabled: boolean; tags: string[] }[]> {
	const { rows } = await client.query(
		"SELECT id, value, enabled, tags FROM prompts WHERE brand_id = $1 AND $2 = ANY(tags) ORDER BY value",
		[TEST_BRAND_ID, MARKER_TAG],
	);
	return rows;
}

async function chainJobs(promptIds: string[]): Promise<{ prompt_id: string; start_after: Date }[]> {
	const { rows } = await client.query(
		`SELECT data->>'promptId' AS prompt_id, start_after FROM pgboss.job
		 WHERE name = 'process-prompt' AND state = 'created' AND data->>'promptId' = ANY($1::text[])`,
		[promptIds],
	);
	return rows;
}

async function cleanup(): Promise<void> {
	const ids = (await markerRows()).map((r) => r.id);
	if (ids.length > 0) {
		await client.query("DELETE FROM pgboss.job WHERE name = 'process-prompt' AND data->>'promptId' = ANY($1::text[])", [
			ids,
		]);
	}
	await client.query("DELETE FROM prompts WHERE brand_id = $1 AND ($2 = ANY(tags) OR value = $3)", [
		TEST_BRAND_ID,
		MARKER_TAG,
		SENTINEL,
	]);
}

async function loadBrand() {
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, TEST_BRAND_ID) });
	if (!brand) throw new Error("brand fixture missing");
	return brand;
}

function tenThousandLines(count: number): string {
	return Array.from(
		{ length: count },
		(_, i) => `PMT-10K import line ${String(i).padStart(5, "0")};${MARKER_TAG};group ${i % 5}`,
	).join("\n");
}

async function errorCode(promise: Promise<unknown>): Promise<string | null> {
	try {
		await promise;
		return null;
	} catch (error) {
		return (error as { code?: string }).code ?? String(error);
	}
}

beforeAll(async () => {
	const host = new URL(DATABASE_URL).hostname;
	if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`refusing non-loopback database ${host}`);
	await client.connect();
	const { rows } = await client.query("SELECT id FROM brands WHERE id = $1", [TEST_BRAND_ID]);
	if (rows.length !== 1) throw new Error("seeded fixtures missing — not the disposable test database");
	await getBoss();
	await cleanup();
}, 60_000);

afterEach(cleanup);

afterAll(async () => {
	await client.query("DROP TRIGGER IF EXISTS pmt10k_reject_sentinel ON prompts");
	await client.query("DROP FUNCTION IF EXISTS pmt10k_reject_sentinel()");
	await client.end();
});

describe("prompt import review and commit", () => {
	it("imports ten thousand lines as disabled in one transaction and queues nothing", async () => {
		const brand = await loadBrand();
		const before = await brandCount();
		const text = tenThousandLines(MAX_PROMPTS - before);

		const reviewStart = performance.now();
		const review = await reviewPromptImport(brand.id, text, false);
		const reviewMs = performance.now() - reviewStart;
		expect(review.summary).toMatchObject({ added: MAX_PROMPTS - before, overCapacity: 0, missingPrompt: 0 });
		expect(review.room).toBe(MAX_PROMPTS - before);
		expect(await brandCount()).toBe(before);

		const commitStart = performance.now();
		const result = await commitPromptImport(brand, text, false, review.token);
		const commitMs = performance.now() - commitStart;
		console.log(`[import] ${result.inserted} rows: review ${reviewMs.toFixed(0)} ms, commit ${commitMs.toFixed(0)} ms`);
		expect(result.inserted).toBe(MAX_PROMPTS - before);
		expect(reviewMs).toBeLessThan(5_000);
		expect(commitMs).toBeLessThan(30_000);

		expect(await brandCount()).toBe(MAX_PROMPTS);
		const rows = await markerRows();
		expect(rows.every((row) => !row.enabled)).toBe(true);
		expect(rows[0]).toMatchObject({ value: "PMT-10K import line 00000", tags: [MARKER_TAG, "group 0"] });
		expect(await chainJobs(rows.map((r) => r.id))).toHaveLength(0);

		// The brand is full: one more line is over capacity and blocks the whole import.
		const overflow = await reviewPromptImport(brand.id, `one more;${MARKER_TAG}`, false);
		expect(overflow.summary.overCapacity).toBe(1);
		expect(await errorCode(commitPromptImport(brand, `one more;${MARKER_TAG}`, false, overflow.token))).toBe(
			"import-over-capacity",
		);
		expect(await brandCount()).toBe(MAX_PROMPTS);
	}, 120_000);

	it("refuses a review the catalog or the text has moved away from", async () => {
		const brand = await loadBrand();
		const text = `stale probe one;${MARKER_TAG}\nstale probe two;${MARKER_TAG}`;
		const review = await reviewPromptImport(brand.id, text, false);

		// The catalog changed underneath the review.
		await client.query(
			"INSERT INTO prompts (brand_id, value, enabled, tags, system_tags) VALUES ($1, 'PMT-10K stale filler', false, ARRAY[$2]::text[], '{}')",
			[brand.id, MARKER_TAG],
		);
		expect(await errorCode(commitPromptImport(brand, text, false, review.token))).toBe("import-review-stale");
		// The text or the chosen status changed.
		const fresh = await reviewPromptImport(brand.id, text, false);
		expect(await errorCode(commitPromptImport(brand, `${text}\nthird`, false, fresh.token))).toBe(
			"import-review-stale",
		);
		expect(await errorCode(commitPromptImport(brand, text, true, fresh.token))).toBe("import-review-stale");
		expect((await markerRows()).map((r) => r.value)).toEqual(["PMT-10K stale filler"]);

		// Reviewed again, it goes through; the duplicate of the filler is reported, not merged.
		const again = await reviewPromptImport(brand.id, `${text}\npmt-10k   STALE filler;other-tag`, false);
		expect(again.summary).toMatchObject({ added: 2, duplicateOfExisting: 1 });
		expect(again.summary.samples.duplicateOfExisting).toEqual(["pmt-10k   STALE filler"]);
		const result = await commitPromptImport(brand, `${text}\npmt-10k   STALE filler;other-tag`, false, again.token);
		expect(result.inserted).toBe(2);
		const rows = await markerRows();
		expect(rows.find((r) => r.value === "PMT-10K stale filler")?.tags).toEqual([MARKER_TAG]);
	});

	it("leaves zero rows when a statement fails in the middle of the commit", async () => {
		const brand = await loadBrand();
		await client.query(`
			CREATE OR REPLACE FUNCTION pmt10k_reject_sentinel() RETURNS trigger AS $$
			BEGIN
				IF NEW.value = '${SENTINEL.replace(/'/g, "''")}' THEN RAISE EXCEPTION 'sentinel rejected by test trigger'; END IF;
				RETURN NEW;
			END $$ LANGUAGE plpgsql`);
		await client.query(
			"CREATE TRIGGER pmt10k_reject_sentinel BEFORE INSERT ON prompts FOR EACH ROW EXECUTE FUNCTION pmt10k_reject_sentinel()",
		);
		try {
			const before = await brandCount();
			// 1 200 lines: the sentinel sits in the third insert chunk, after two chunks already wrote.
			const lines = Array.from({ length: 1_200 }, (_, i) => `PMT-10K atomic ${i};${MARKER_TAG}`);
			lines[1_100] = SENTINEL;
			const text = lines.join("\n");
			const review = await reviewPromptImport(brand.id, text, false);
			expect(review.summary.added).toBe(1_200);
			await expect(commitPromptImport(brand, text, false, review.token)).rejects.toThrow();
			expect(await brandCount()).toBe(before);
			expect(await markerRows()).toEqual([]);
		} finally {
			await client.query("DROP TRIGGER IF EXISTS pmt10k_reject_sentinel ON prompts");
			await client.query("DROP FUNCTION IF EXISTS pmt10k_reject_sentinel()");
		}
	});

	it("starts one chain per enabled import row, spread over the cadence, and never a second one", async () => {
		const brand = await loadBrand();
		const text = Array.from({ length: 120 }, (_, i) => `PMT-10K enabled import ${i};${MARKER_TAG}`).join("\n");
		const review = await reviewPromptImport(brand.id, text, true);
		const result = await commitPromptImport(brand, text, true, review.token);
		expect(result.inserted).toBe(120);
		expect((await markerRows()).every((row) => row.enabled)).toBe(true);

		await scheduleFirstPromptRuns(result.insertedIds);
		const jobs = await chainJobs(result.insertedIds);
		expect(jobs).toHaveLength(120);
		expect(new Set(jobs.map((j) => j.prompt_id)).size).toBe(120);
		const starts = jobs.map((j) => j.start_after.getTime()).sort((a, b) => a - b);
		const cadenceMs = (brand.delayOverrideHours ?? 24) * 3600 * 1000;
		expect(starts[starts.length - 1] - starts[0]).toBeGreaterThan(cadenceMs * 0.9);
		expect(new Set(starts).size).toBeGreaterThan(100);

		// Enabling again (or re-running the scheduler) keeps the chains as they are.
		await scheduleFirstPromptRuns(result.insertedIds);
		expect(await chainJobs(result.insertedIds)).toHaveLength(120);
	}, 60_000);
});
