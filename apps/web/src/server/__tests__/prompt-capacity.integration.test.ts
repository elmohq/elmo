/**
 * Runs against the disposable E2E test database (the one `e2e/seed.ts` owns):
 * `pnpm -C apps/web test:integration` with DATABASE_URL pointing at it.
 *
 * The brand cap is a database fact, not a form check: 9 999 → 10 000 is the
 * last allowed save, 10 000 → 10 001 is refused on every creation path, two
 * saves racing for the last slot get one winner, and neither the other
 * tenant's rows nor a smaller plan limit are affected by the cap.
 */
import { type Entitlements, UNLIMITED_ENTITLEMENTS } from "@workspace/config/entitlements";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL must point at the seeded test stack");

const TEST_BRAND_ID = "default";
const NIKE_BRAND_ID = "nike";
const MARKER_TAG = "pmt10k-it-capacity";

// Local mode resolves every org as unlimited, so the plan-pool branch of the
// save guard is only reachable by handing it a metered plan here. Everything
// else in the service module stays real.
let entitlementOverride: Entitlements | null = null;
vi.mock("../../../../../packages/lib/src/entitlements/service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../../../packages/lib/src/entitlements/service")>();
	return {
		...actual,
		getOrgEntitlements: async (organizationId: string) =>
			entitlementOverride ?? actual.getOrgEntitlements(organizationId),
	};
});

const { savePromptsForBrand } = await import("@/server/save-prompts");
const { getBoss } = await import("@/lib/boss-client");
const { MAX_PROMPTS } = await import("@workspace/lib/constants");
const { db } = await import("@workspace/lib/db/db");
const { brands } = await import("@workspace/lib/db/schema");
const { eq } = await import("drizzle-orm");

const client = new pg.Client({ connectionString: DATABASE_URL });
const noScheduler = { scheduleNewPrompts: async () => {} };

async function brandCount(brandId: string): Promise<number> {
	const { rows } = await client.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM prompts WHERE brand_id = $1", [
		brandId,
	]);
	return rows[0].n;
}

/** Bring the brand to exactly `total` rows with marker-tagged, disabled filler. */
async function fillBrandTo(brandId: string, total: number): Promise<void> {
	await client.query("DELETE FROM prompts WHERE brand_id = $1 AND $2 = ANY(tags)", [brandId, MARKER_TAG]);
	const missing = total - (await brandCount(brandId));
	if (missing < 0) throw new Error(`brand ${brandId} already holds more than ${total} rows`);
	if (missing === 0) return;
	await client.query(
		`INSERT INTO prompts (brand_id, value, enabled, tags, system_tags)
		 SELECT $1, 'PMT-10K filler ' || g, false, ARRAY[$2]::text[], ARRAY['unbranded']::text[]
		 FROM generate_series(1, $3::int) AS g`,
		[brandId, MARKER_TAG, missing],
	);
}

async function loadBrand(brandId: string) {
	const brand = await db.query.brands.findFirst({ where: eq(brands.id, brandId) });
	if (!brand) throw new Error(`brand fixture ${brandId} missing`);
	return brand;
}

function newPrompt(label: string, enabled = false) {
	return { value: `PMT-10K probe ${label} ${Date.now()} ${Math.random()}`, enabled, tags: [MARKER_TAG] };
}

async function denialCode(promise: Promise<unknown>): Promise<string | null> {
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
	const { rows } = await client.query("SELECT id FROM brands WHERE id = ANY($1::text[]) ORDER BY id", [
		[TEST_BRAND_ID, NIKE_BRAND_ID],
	]);
	if (rows.length !== 2) throw new Error("seeded fixtures missing — not the disposable test database");
	// The save's post-commit expedite touches pgboss.job; the web process
	// creates that schema on its first send, so do the same here.
	await getBoss();
}, 60_000);

afterEach(() => {
	entitlementOverride = null;
});

afterAll(async () => {
	for (const brandId of [TEST_BRAND_ID, NIKE_BRAND_ID]) {
		await client.query("DELETE FROM prompts WHERE brand_id = $1 AND $2 = ANY(tags)", [brandId, MARKER_TAG]);
	}
	await client.end();
});

describe("brand prompt cap (MAX_PROMPTS) at the database boundary", () => {
	it("admits the 10 000th prompt and refuses the 10 001st on a settings save", async () => {
		const brand = await loadBrand(TEST_BRAND_ID);
		await fillBrandTo(TEST_BRAND_ID, MAX_PROMPTS - 1);

		const saved = await savePromptsForBrand(brand, [newPrompt("last-slot")], noScheduler);
		expect(saved).toHaveLength(1);
		expect(await brandCount(TEST_BRAND_ID)).toBe(MAX_PROMPTS);

		expect(await denialCode(savePromptsForBrand(brand, [newPrompt("over")], noScheduler))).toBe("prompt-cap");
		expect(await brandCount(TEST_BRAND_ID)).toBe(MAX_PROMPTS);

		// A full brand stays editable: a save that inserts nothing is allowed.
		const edited = await savePromptsForBrand(
			brand,
			[{ id: saved[0].id, value: `${saved[0].value} edited`, enabled: false, tags: [MARKER_TAG] }],
			noScheduler,
		);
		expect(edited[0].value).toMatch(/edited$/);
		expect(await brandCount(TEST_BRAND_ID)).toBe(MAX_PROMPTS);
	}, 60_000);

	it("gives concurrent saves racing for the last slot exactly one winner", async () => {
		const brand = await loadBrand(TEST_BRAND_ID);
		await fillBrandTo(TEST_BRAND_ID, MAX_PROMPTS - 1);

		const outcomes = await Promise.all(
			Array.from({ length: 6 }, (_, i) =>
				denialCode(savePromptsForBrand(brand, [newPrompt(`race-${i}`)], noScheduler)),
			),
		);
		expect(outcomes.filter((code) => code === null)).toHaveLength(1);
		expect(outcomes.filter((code) => code === "prompt-cap")).toHaveLength(5);
		expect(await brandCount(TEST_BRAND_ID)).toBe(MAX_PROMPTS);
	}, 60_000);

	it("counts each brand on its own and refuses ids from another brand", async () => {
		const brand = await loadBrand(TEST_BRAND_ID);
		const nike = await loadBrand(NIKE_BRAND_ID);
		await fillBrandTo(TEST_BRAND_ID, MAX_PROMPTS);
		const nikeBefore = await brandCount(NIKE_BRAND_ID);

		const savedNike = await savePromptsForBrand(nike, [newPrompt("nike")], noScheduler);
		expect(savedNike).toHaveLength(1);
		expect(await brandCount(NIKE_BRAND_ID)).toBe(nikeBefore + 1);
		expect(await brandCount(TEST_BRAND_ID)).toBe(MAX_PROMPTS);

		// An update addressed at another tenant's row is stale, not an edit.
		expect(
			await denialCode(
				savePromptsForBrand(brand, [{ id: savedNike[0].id, value: "hijack", enabled: false }], noScheduler),
			),
		).toBe("prompt-save-stale");
		const { rows } = await client.query("SELECT value FROM prompts WHERE id = $1", [savedNike[0].id]);
		expect(rows[0].value).toBe(savedNike[0].value);
	}, 60_000);

	it("keeps a smaller plan limit in force below the brand cap", async () => {
		const brand = await loadBrand(TEST_BRAND_ID);
		await fillBrandTo(TEST_BRAND_ID, 50);
		const { rows } = await client.query<{ n: number }>(
			`SELECT COUNT(*)::int AS n FROM prompts p JOIN brands b ON b.id = p.brand_id
			 WHERE b.organization_id = $1 AND p.enabled`,
			[brand.organizationId],
		);
		entitlementOverride = {
			...UNLIMITED_ENTITLEMENTS,
			unlimited: false,
			planKey: "pro",
			standing: "active",
			trackingActive: true,
			maxPrompts: rows[0].n + 1,
		};

		expect(
			await denialCode(savePromptsForBrand(brand, [newPrompt("pool-1", true), newPrompt("pool-2", true)], noScheduler)),
		).toBe("prompt-limit");
		// Disabled rows do not draw on the plan pool, only on the brand cap.
		expect(
			await savePromptsForBrand(brand, [newPrompt("pool-off-1"), newPrompt("pool-off-2")], noScheduler),
		).toHaveLength(2);
		expect(await savePromptsForBrand(brand, [newPrompt("pool-3", true)], noScheduler)).toHaveLength(1);
		expect(await denialCode(savePromptsForBrand(brand, [newPrompt("pool-4", true)], noScheduler))).toBe("prompt-limit");
	}, 60_000);
});
