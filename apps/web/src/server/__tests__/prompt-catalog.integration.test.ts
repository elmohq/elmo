/**
 * Runs against the disposable E2E test database: `pnpm -C apps/web
 * test:integration` with DATABASE_URL pointing at it.
 *
 * The catalog page is what the browser gets instead of the whole list: fifty
 * rows, counts that match the filter, an order that never repeats or skips a
 * row across the two hundred pages a full brand has, and a bounded tag list.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL must point at the seeded test stack");

const TEST_BRAND_ID = "default";
const NIKE_BRAND_ID = "nike";
const MARKER_TAG = "pmt10k-it-catalog";

const { loadPromptCatalogPage } = await import("@/server/prompt-catalog-load");
const { MAX_PROMPTS } = await import("@workspace/lib/constants");
const { PROMPT_CATALOG_PAGE_SIZE, PROMPT_CATALOG_TAG_LIMIT } = await import("@/lib/prompt-catalog");

const client = new pg.Client({ connectionString: DATABASE_URL });
const query = (page = 1, rest: Partial<{ q: string; tag: string; status: "all" | "enabled" | "disabled" }> = {}) => ({
	page,
	q: "",
	tag: "",
	status: "all" as const,
	...rest,
});

let seededBefore = 0;

beforeAll(async () => {
	const host = new URL(DATABASE_URL).hostname;
	if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`refusing non-loopback database ${host}`);
	await client.connect();
	const { rows } = await client.query("SELECT id FROM brands WHERE id = ANY($1::text[])", [
		[TEST_BRAND_ID, NIKE_BRAND_ID],
	]);
	if (rows.length !== 2) throw new Error("seeded fixtures missing — not the disposable test database");

	await client.query("DELETE FROM prompts WHERE $1 = ANY(tags)", [MARKER_TAG]);
	seededBefore = Number(
		(await client.query("SELECT COUNT(*)::int AS n FROM prompts WHERE brand_id = $1", [TEST_BRAND_ID])).rows[0].n,
	);
	// Fill the brand to the cap: every 7th row enabled, every 3rd row carrying a
	// second tag from a pool of 80 so the tag list has more than the limit,
	// one row with LIKE wildcards in its text.
	await client.query(
		`INSERT INTO prompts (brand_id, value, enabled, tags, system_tags)
		 SELECT $1,
		        CASE WHEN g = 4242 THEN 'PMT-10K catalog 100% match_test' ELSE 'PMT-10K catalog row ' || lpad(g::text, 5, '0') END,
		        g % 7 = 0,
		        CASE WHEN g % 3 = 0 THEN ARRAY[$2, 'pool-' || lpad((g % 80)::text, 2, '0')] ELSE ARRAY[$2] END::text[],
		        ARRAY['unbranded']::text[]
		 FROM generate_series(1, $3::int) AS g`,
		[TEST_BRAND_ID, MARKER_TAG, MAX_PROMPTS - seededBefore],
	);
	// Another tenant carries the same marker so the brand scope is provable.
	await client.query(
		`INSERT INTO prompts (brand_id, value, enabled, tags, system_tags)
		 VALUES ($1, 'PMT-10K catalog row 00001 (other tenant)', true, ARRAY[$2]::text[], ARRAY['unbranded']::text[])`,
		[NIKE_BRAND_ID, MARKER_TAG],
	);
}, 120_000);

afterAll(async () => {
	await client.query("DELETE FROM prompts WHERE $1 = ANY(tags)", [MARKER_TAG]);
	await client.end();
});

describe("loadPromptCatalogPage", () => {
	it("serves fifty rows with counts that match the filter and the whole brand", async () => {
		const first = await loadPromptCatalogPage(TEST_BRAND_ID, query(1));
		expect(first.rows).toHaveLength(PROMPT_CATALOG_PAGE_SIZE);
		expect(first.total).toBe(MAX_PROMPTS);
		expect(first.totalPages).toBe(MAX_PROMPTS / PROMPT_CATALOG_PAGE_SIZE);
		expect(first.brand.total).toBe(MAX_PROMPTS);
		expect(first.rows.every((row) => row.brandId === TEST_BRAND_ID)).toBe(true);

		const { rows } = await client.query<{ enabled: number; disabled: number; tagged: number }>(
			`SELECT COUNT(*) FILTER (WHERE enabled)::int AS enabled,
			        COUNT(*) FILTER (WHERE NOT enabled)::int AS disabled,
			        COUNT(*) FILTER (WHERE 'pool-07' = ANY(tags))::int AS tagged
			 FROM prompts WHERE brand_id = $1`,
			[TEST_BRAND_ID],
		);
		const enabled = await loadPromptCatalogPage(TEST_BRAND_ID, query(1, { status: "enabled" }));
		expect(enabled.total).toBe(rows[0].enabled);
		expect(enabled.brand.enabled).toBe(rows[0].enabled);
		expect(enabled.rows.every((row) => row.enabled)).toBe(true);
		const disabled = await loadPromptCatalogPage(TEST_BRAND_ID, query(1, { status: "disabled" }));
		expect(disabled.total).toBe(rows[0].disabled);
		const tagged = await loadPromptCatalogPage(TEST_BRAND_ID, query(1, { tag: "pool-07" }));
		expect(tagged.total).toBe(rows[0].tagged);
		expect(tagged.rows.every((row) => row.tags.includes("pool-07"))).toBe(true);
	});

	it("searches text case-insensitively and treats LIKE wildcards as characters", async () => {
		const plain = await loadPromptCatalogPage(TEST_BRAND_ID, query(1, { q: "CATALOG ROW 0424" }));
		expect(plain.total).toBe(9); // 04240–04249 minus the wildcard row that replaced 04242
		const wildcard = await loadPromptCatalogPage(TEST_BRAND_ID, query(1, { q: "100% match_test" }));
		expect(wildcard.total).toBe(1);
		const underscore = await loadPromptCatalogPage(TEST_BRAND_ID, query(1, { q: "row_0424" }));
		expect(underscore.total).toBe(0);
	});

	it("keeps a total order across all two hundred pages and clamps a page past the end", async () => {
		const seen = new Set<string>();
		const timings: number[] = [];
		const totalPages = MAX_PROMPTS / PROMPT_CATALOG_PAGE_SIZE;
		for (let page = 1; page <= totalPages; page++) {
			const started = performance.now();
			const result = await loadPromptCatalogPage(TEST_BRAND_ID, query(page));
			timings.push(performance.now() - started);
			expect(result.page).toBe(page);
			expect(result.rows).toHaveLength(PROMPT_CATALOG_PAGE_SIZE);
			for (const row of result.rows) {
				expect(seen.has(row.id), `row ${row.id} appeared on two pages`).toBe(false);
				seen.add(row.id);
			}
		}
		expect(seen.size).toBe(MAX_PROMPTS);
		timings.sort((a, b) => a - b);
		const p95 = timings[Math.floor(timings.length * 0.95)];
		console.log(
			`[catalog] ${totalPages} page loads: p50 ${timings[Math.floor(timings.length / 2)].toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${timings[timings.length - 1].toFixed(1)} ms`,
		);
		expect(p95).toBeLessThan(500);

		const beyond = await loadPromptCatalogPage(TEST_BRAND_ID, query(totalPages + 5));
		expect(beyond.page).toBe(totalPages);
		expect(beyond.rows).toHaveLength(PROMPT_CATALOG_PAGE_SIZE);
	}, 120_000);

	it("caps the tag list and never lists another brand's tags", async () => {
		const result = await loadPromptCatalogPage(TEST_BRAND_ID, query(1));
		expect(result.tagOptions.length).toBe(PROMPT_CATALOG_TAG_LIMIT);
		expect(result.tagOptions).toEqual([...result.tagOptions].sort());
		const nike = await loadPromptCatalogPage(NIKE_BRAND_ID, query(1));
		expect(nike.rows.every((row) => row.brandId === NIKE_BRAND_ID)).toBe(true);
		expect(nike.tagOptions.some((tag) => tag.startsWith("pool-"))).toBe(false);
	});
});
