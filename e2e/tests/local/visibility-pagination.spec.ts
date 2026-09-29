/**
 * VIS-PAG-01 — the per-prompt chart cards on the Visibility page are paged ten
 * at a time with the shared Citations pager (`1–10 of 23`, Previous / Next).
 *
 * The spec seeds its own brand in the shared test organization: 23 enabled
 * prompts with deterministic names, one disabled prompt that must never render,
 * a tag that matches exactly ten prompts, a tag that matches twelve, a search
 * word that matches eleven, and three runs so the Competitive overview above
 * the list has numbers. Expected page memberships come from this fixture data
 * alone (plain `localeCompare` sorting), never from an application helper.
 */
import { expect, type Locator, type Page, test } from "@playwright/test";
import pg from "pg";
import { brandUrl, DATABASE_URL, TEST_ORG_SLUG } from "../../fixtures";

const BRAND_ID = "vpag-vis";
const BRAND_NAME = "Vpag Visible";
const BRAND_URL = brandUrl(BRAND_ID, TEST_ORG_SLUG);
const VISIBILITY_URL = `${BRAND_URL}/visibility`;
const PAGE_SIZE = 10;

const TAG_TEN = "vpag-ten";
const TAG_MANY = "vpag-many";
const SEARCH_WORD = "quokka";

// Names deliberately do not sort the way their ids do, so an alphabetical page
// is distinguishable from an insertion-order page.
const WORDS = [
	"zebra", "mango", "quokka apple", "kiwi", "quokka delta", "otter", "quokka banana", "yak", "lemon",
	"quokka cherry", "nectar", "quokka fig", "umbra", "quokka grape", "violet", "quokka hazel", "walnut",
	"quokka iris", "xenon", "quokka juniper", "tango", "quokka kelp", "quokka sierra",
];

interface FixturePrompt {
	id: string;
	value: string;
	tags: string[];
	enabled: boolean;
}

const PROMPTS: FixturePrompt[] = WORDS.map((word, i) => {
	const n = i + 1;
	const nn = String(n).padStart(2, "0");
	const tags: string[] = [];
	if (n <= 10) tags.push(TAG_TEN);
	if (n >= 12) tags.push(TAG_MANY);
	return { id: `7a9e0001-0000-4000-8000-0000000000${nn}`, value: `Vpag ${word} ${nn}`, tags, enabled: true };
});
const DISABLED_PROMPT: FixturePrompt = {
	id: "7a9e0001-0000-4000-8000-000000000099",
	value: `Vpag ${SEARCH_WORD} disabled 99`,
	tags: [TAG_TEN, TAG_MANY],
	enabled: false,
};
const RUN_PROMPTS = [PROMPTS[2], PROMPTS[11], PROMPTS[19]];

function noonDaysAgo(days: number): Date {
	const d = new Date();
	d.setUTCHours(12, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - days);
	return d;
}

// ---------------------------------------------------------------------------
// Independent oracle: plain test logic over the fixture arrays.
// ---------------------------------------------------------------------------

const byName = (a: FixturePrompt, b: FixturePrompt) => a.value.localeCompare(b.value);
const enabled = PROMPTS.filter((p) => p.enabled);
const names = (list: FixturePrompt[]) => list.map((p) => p.value);
const ascending = names([...enabled].sort(byName));
const descending = [...ascending].reverse();
const withTag = (tag: string) => enabled.filter((p) => p.tags.includes(tag));
const withWord = enabled.filter((p) => p.value.toLowerCase().includes(SEARCH_WORD));
const slice = (list: string[], pageIndex: number) => list.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
const range = (pageIndex: number, total: number) =>
	`${pageIndex * PAGE_SIZE + 1}–${Math.min((pageIndex + 1) * PAGE_SIZE, total)} of ${total}`;

// ---------------------------------------------------------------------------
// Page access
// ---------------------------------------------------------------------------

const HEADER_HEIGHT = 64;
const list = (page: Page) => page.getByTestId("visibility-prompt-list");
const pager = (page: Page) => page.getByTestId("visibility-prompt-pagination");
const rangeText = (page: Page) => pager(page).locator("span").first();
const previous = (page: Page) => pager(page).getByRole("button", { name: "Previous" });
const next = (page: Page) => pager(page).getByRole("button", { name: "Next" });
const titles = (page: Page) => list(page).locator("[data-slot=card-title]");
const headline = (page: Page) => page.getByTestId("competitive-visibility-headline");
// Rendered only while a tag or search filter narrows the list; tags narrow on the
// server ("12 results"), the search narrows the fetched list ("11 of 23 results").
const resultCount = (page: Page) => page.getByText(/^\d+( of \d+)? results?$/);

async function open(page: Page, search = "") {
	await page.goto(`${VISIBILITY_URL}${search}`);
	await expect(page.getByRole("heading", { level: 1, name: /^visibility$/i })).toBeVisible({ timeout: 30_000 });
	await expect(titles(page).first()).toBeVisible({ timeout: 30_000 });
}

/** Every card title on the current page, in list order. The list is
 *  window-virtualized, so this walks the page from the list top to the pager
 *  and keys what mounts by the virtualizer's `data-index` — the walk's timing
 *  must not decide the order. */
async function collectTitles(page: Page): Promise<string[]> {
	const byIndex = new Map<number, string>();
	const add = async () => {
		const mounted = await list(page)
			.locator("[data-index]")
			.evaluateAll((els) =>
				els.map((el) => [Number(el.getAttribute("data-index")), el.querySelector("[data-slot=card-title]")?.textContent ?? ""] as [number, string]),
			);
		for (const [index, title] of mounted) if (title) byIndex.set(index, title);
	};
	await list(page).evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
	await add();
	for (let i = 0; i < 40; i++) {
		const done = await page.evaluate(() => {
			const before = window.scrollY;
			window.scrollBy(0, Math.round(window.innerHeight * 0.6));
			return window.scrollY === before;
		});
		await page.waitForTimeout(50);
		await add();
		if (done) break;
	}
	return [...byIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, title]) => title);
}

async function expectPage(page: Page, expected: string[], total: number, pageIndex: number) {
	await expect(rangeText(page)).toHaveText(range(pageIndex, total));
	expect(await collectTitles(page)).toEqual(expected);
}

async function noHorizontalOverflow(page: Page) {
	const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
	expect(m.s).toBeLessThanOrEqual(m.c);
}
async function withinViewport(locator: Locator, page: Page) {
	const box = (await locator.boundingBox()) as { x: number; y: number; width: number; height: number };
	const viewport = page.viewportSize() as { width: number; height: number };
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
	expect(box.y).toBeGreaterThanOrEqual(0);
	expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function screenshot(page: Page, name: string) {
	const dir = process.env.VPAG_SCREENSHOT_DIR;
	if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
}

/** Chooses a radio item in an open dropdown whose label differs from the trigger's current label. */
async function pickOtherRadio(page: Page, trigger: Locator) {
	const current = ((await trigger.textContent()) ?? "").trim();
	await trigger.click();
	const items = page.getByRole("menuitemradio");
	await expect(items.first()).toBeVisible();
	const labels = await items.allTextContents();
	const index = labels.findIndex((l) => l.trim() && l.trim() !== current);
	await items.nth(index).click();
}

// ---------------------------------------------------------------------------

test.describe("Visibility prompt pagination", () => {
	test.describe.configure({ mode: "serial" });
	test.use({ timezoneId: "UTC" });

	let client: pg.Client;

	test.beforeAll(async () => {
		const host = new URL(DATABASE_URL).hostname;
		if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`refusing non-loopback database ${host}`);
		client = new pg.Client({ connectionString: DATABASE_URL });
		await client.connect();
		const org = await client.query("SELECT id FROM organization WHERE slug = $1", [TEST_ORG_SLUG]);
		if (org.rows.length !== 1) throw new Error("seeded organization missing — not the disposable test database");

		await client.query(
			`INSERT INTO brands (id, organization_id, slug, name, website, enabled, onboarded, created_at, updated_at)
			 VALUES ($1, $2, $1, $3, 'https://vpag.example.test/', true, true, NOW(), NOW())`,
			[BRAND_ID, org.rows[0].id, BRAND_NAME],
		);
		for (const p of [...PROMPTS, DISABLED_PROMPT]) {
			await client.query(
				`INSERT INTO prompts (id, brand_id, value, enabled, tags, system_tags, created_at, updated_at)
				 VALUES ($1, $2, $3, $4, $5, '{unbranded}', NOW(), NOW())`,
				[p.id, BRAND_ID, p.value, p.enabled, p.tags],
			);
		}
		await client.query(
			`INSERT INTO competitors (id, brand_id, name, domains, created_at, updated_at)
			 VALUES ('7a9e0003-0000-4000-8000-000000000001', $1, 'Rival', '{rival.example.test}', NOW(), NOW())`,
			[BRAND_ID],
		);
		for (const [i, p] of RUN_PROMPTS.entries()) {
			await client.query(
				`INSERT INTO prompt_runs (id, prompt_id, brand_id, model, provider, version, web_search_enabled, raw_output, web_queries, brand_mentioned, competitors_mentioned, created_at)
				 VALUES ($1, $2, $3, 'chatgpt', 'brightdata', 'vpag', true, '{}', '{}', true, '{Rival}', $4)`,
				[`7a9e0002-0000-4000-8000-00000000000${i + 1}`, p.id, BRAND_ID, noonDaysAgo(2)],
			);
		}
	});

	test.afterAll(async () => {
		try {
			await client.query("DELETE FROM prompt_runs WHERE brand_id = $1", [BRAND_ID]);
			await client
				.query("DELETE FROM pgboss.job WHERE name = 'process-prompt' AND data->>'promptId' LIKE '7a9e0001-%'")
				.catch(() => undefined);
			await client.query("DELETE FROM prompts WHERE brand_id = $1", [BRAND_ID]);
			await client.query("DELETE FROM competitors WHERE brand_id = $1", [BRAND_ID]);
			await client.query("DELETE FROM brands WHERE id = $1", [BRAND_ID]);
		} finally {
			await client.end();
		}
	});

	test("E2E-VPAG-001/002/003: 23 prompts are three exact, disjoint pages that never include the disabled prompt", async ({ page }) => {
		await open(page);
		await expect(rangeText(page)).toHaveText("1–10 of 23");
		await expect(previous(page)).toBeDisabled();
		await expect(next(page)).toBeEnabled();
		await expect(resultCount(page)).toHaveCount(0);
		await screenshot(page, "01-page1-default");

		const seen: string[] = [];
		seen.push(...(await collectTitles(page)));
		expect(seen).toHaveLength(10);

		await next(page).click();
		await expect(rangeText(page)).toHaveText("11–20 of 23");
		await expect(previous(page)).toBeEnabled();
		await expect(next(page)).toBeEnabled();
		const page2 = await collectTitles(page);
		expect(page2).toHaveLength(10);
		seen.push(...page2);

		await next(page).click();
		await expect(rangeText(page)).toHaveText("21–23 of 23");
		await expect(next(page)).toBeDisabled();
		await expect(previous(page)).toBeEnabled();
		const page3 = await collectTitles(page);
		expect(page3).toHaveLength(3);
		seen.push(...page3);
		await screenshot(page, "02-page3-default");

		expect(new Set(seen).size).toBe(23);
		expect([...seen].sort()).toEqual([...names(enabled)].sort());
		expect(seen).not.toContain(DISABLED_PROMPT.value);

		await previous(page).click();
		await expect(rangeText(page)).toHaveText("11–20 of 23");
		expect(await collectTitles(page)).toEqual(page2);
	});

	test("E2E-VPAG-005: filters and the selected sort are applied to the whole list before it is sliced", async ({ page }) => {
		await open(page, "?order=prompt-asc");
		await expectPage(page, slice(ascending, 0), 23, 0);
		// Prompts of later pages are unreachable until navigation.
		for (const name of [...slice(ascending, 1), ...slice(ascending, 2)]) await expect(titles(page).filter({ hasText: name })).toHaveCount(0);
		await next(page).click();
		await expectPage(page, slice(ascending, 1), 23, 1);
		await next(page).click();
		await expectPage(page, slice(ascending, 2), 23, 2);

		await open(page, "?order=prompt-desc");
		await expectPage(page, slice(descending, 0), 23, 0);
		await next(page).click();
		await next(page).click();
		await expectPage(page, slice(descending, 2), 23, 2);

		const many = names(withTag(TAG_MANY).sort(byName));
		expect(many).toHaveLength(12);
		await open(page, `?tags=${TAG_MANY}&order=prompt-asc`);
		await expect(resultCount(page)).toHaveText("12 results");
		await expectPage(page, slice(many, 0), 12, 0);
		await next(page).click();
		await expectPage(page, slice(many, 1), 12, 1);
		await expect(next(page)).toBeDisabled();

		const quokka = names(withWord.sort(byName));
		expect(quokka).toHaveLength(11);
		await open(page, `?q=${SEARCH_WORD}&order=prompt-asc`);
		await expect(resultCount(page)).toHaveText("11 of 23 results");
		await expectPage(page, slice(quokka, 0), 11, 0);
		await next(page).click();
		await expectPage(page, slice(quokka, 1), 11, 1);
		await expect(titles(page).filter({ hasText: DISABLED_PROMPT.value })).toHaveCount(0);
	});

	test("E2E-VPAG-004: the footer is absent at ten matches and present at eleven", async ({ page }) => {
		await open(page, `?tags=${TAG_TEN}`);
		await expect(resultCount(page)).toHaveText("10 results");
		expect(await collectTitles(page)).toHaveLength(10);
		await expect(pager(page)).toBeEmpty();
		await expect(page.getByRole("button", { name: "Previous" })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Next" })).toHaveCount(0);
		await expect(titles(page).filter({ hasText: DISABLED_PROMPT.value })).toHaveCount(0);
		await screenshot(page, "03-ten-no-footer");

		await open(page, `?q=${SEARCH_WORD}`);
		await expect(rangeText(page)).toHaveText("1–10 of 11");
		await next(page).click();
		await expect(rangeText(page)).toHaveText("11–11 of 11");
		await expect(next(page)).toBeDisabled();
		expect(await collectTitles(page)).toHaveLength(1);
		await screenshot(page, "04-eleven-last-page");
	});

	test("E2E-VPAG-006: every scope or order change returns to the first page", async ({ page }) => {
		const onPageTwo = async () => {
			await open(page, "?order=prompt-asc");
			await next(page).click();
			await expect(rangeText(page)).toHaveText("11–20 of 23");
		};

		// Tags (UI).
		await onPageTwo();
		await page.getByRole("button", { name: /^tags$/i }).click();
		await page.getByRole("button", { name: TAG_MANY }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL(new RegExp(`tags=${TAG_MANY}`));
		await expect(rangeText(page)).toHaveText("1–10 of 12");

		// Lookback (UI).
		await onPageTwo();
		await pickOtherRadio(page, page.getByRole("button", { name: /^(Last .+|All time)$/ }));
		await page.waitForURL(/lookback=/);
		await expect(rangeText(page)).toHaveText("1–10 of 23");

		// Search (UI, after the debounce commits).
		await onPageTwo();
		await page.getByPlaceholder("Search prompts...").fill(SEARCH_WORD);
		await page.waitForURL(new RegExp(`q=${SEARCH_WORD}`));
		await expect(rangeText(page)).toHaveText("1–10 of 11");

		// Sort (UI).
		await onPageTwo();
		await page.getByRole("button", { name: "Prompt A–Z" }).click();
		await page.getByRole("menuitemradio", { name: "Prompt Z–A" }).click();
		await page.waitForURL(/order=prompt-desc/);
		await expect(rangeText(page)).toHaveText("1–10 of 23");
		expect((await collectTitles(page))[0]).toBe(descending[0]);

		// Model: through the selector when the deployment tracks several models,
		// otherwise through the URL key the single-model deployment still honours.
		await onPageTwo();
		const modelTrigger = page.getByRole("button", { name: "All models" });
		if (await modelTrigger.isVisible()) {
			await pickOtherRadio(page, modelTrigger);
			await page.waitForURL(/model=/);
		} else {
			await page.goto(`${VISIBILITY_URL}?order=prompt-asc&model=chatgpt`);
		}
		await expect(rangeText(page)).toHaveText("1–10 of 23");
	});

	test("E2E-VPAG-007: Previous/Next reveal the first card of the new page and work from the keyboard", async ({ page }) => {
		await open(page, "?order=prompt-asc");
		const viewport = page.viewportSize() as { height: number };
		const initialScroll = await page.evaluate(() => window.scrollY);
		expect(initialScroll).toBe(0);

		// Read the pager from the bottom of a tall page, as a user would.
		await pager(page).scrollIntoViewIfNeeded();
		expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(viewport.height);
		await next(page).click();
		await expect(rangeText(page)).toHaveText("11–20 of 23");
		const first = titles(page).filter({ hasText: ascending[10] });
		await expect(first).toBeVisible();
		const box = (await first.boundingBox()) as { y: number };
		expect(box.y).toBeGreaterThanOrEqual(HEADER_HEIGHT);
		expect(box.y).toBeLessThan(viewport.height / 2);
		await screenshot(page, "05-after-next");

		// Last page is shorter than the previous scroll position.
		await pager(page).scrollIntoViewIfNeeded();
		await next(page).click();
		await expect(rangeText(page)).toHaveText("21–23 of 23");
		const last = titles(page).filter({ hasText: ascending[20] });
		await expect(last).toBeVisible();
		expect(((await last.boundingBox()) as { y: number }).y).toBeGreaterThanOrEqual(HEADER_HEIGHT);

		// Keyboard: Previous via Space, then Enter; focus stays on the control.
		await previous(page).focus();
		await page.keyboard.press("Space");
		await expect(rangeText(page)).toHaveText("11–20 of 23");
		await expect(previous(page)).toBeFocused();
		await expect(titles(page).filter({ hasText: ascending[10] })).toBeVisible();
		await page.keyboard.press("Enter");
		await expect(rangeText(page)).toHaveText("1–10 of 23");
		await expect(previous(page)).toBeDisabled();
		await expect(titles(page).filter({ hasText: ascending[0] })).toBeVisible();
	});

	test("E2E-VPAG-008/009: paging touches neither the URL nor the server and leaves the full-scope numbers alone", async ({ page }) => {
		const loadedAt = Date.now();
		await open(page, "?order=prompt-asc");
		await expect(headline(page)).toBeVisible({ timeout: 30_000 });
		const headlineBefore = await headline(page).textContent();
		const leaderboardBefore = await page.getByTestId("competitive-visibility-leaderboard").locator("tbody tr").allTextContents();
		expect(leaderboardBefore.length).toBeGreaterThan(0);
		await page.waitForTimeout(1_500);

		const url = page.url();
		expect(url).not.toMatch(/page=|offset=|limit=|pageSize=/);
		const serverCalls: string[] = [];
		page.on("response", (response) => {
			if (response.url().includes("/_serverFn/")) serverCalls.push(response.url());
		});
		await next(page).click();
		await expect(rangeText(page)).toHaveText("11–20 of 23");
		await previous(page).click();
		await expect(rangeText(page)).toHaveText("1–10 of 23");
		await next(page).click();
		await next(page).click();
		await expect(rangeText(page)).toHaveText("21–23 of 23");
		await page.waitForTimeout(2_000);
		// The summary query polls every 60 s; stay inside the first interval so the
		// observation window can only contain requests caused by the clicks.
		expect(Date.now() - loadedAt).toBeLessThan(55_000);
		expect(serverCalls).toEqual([]);
		expect(page.url()).toBe(url);

		expect(await headline(page).textContent()).toBe(headlineBefore);
		expect(await page.getByTestId("competitive-visibility-leaderboard").locator("tbody tr").allTextContents()).toEqual(leaderboardBefore);
		await expect(page.getByTestId("competitive-visibility-section")).toContainText(`across ${RUN_PROMPTS.length} evaluated prompts`);

		await page.reload();
		await expect(titles(page).first()).toBeVisible({ timeout: 30_000 });
		await expect(rangeText(page)).toHaveText("1–10 of 23");
		expect(page.url()).toBe(url);
	});

	test("E2E-VPAG-007b: a background refresh with an unchanged scope keeps the current page", async ({ page }) => {
		test.setTimeout(150_000);
		await open(page, "?order=prompt-asc");
		await next(page).click();
		await expectPage(page, slice(ascending, 1), 23, 1);

		// The prompt summary refetches on its 60 s interval; wait for that response.
		const refreshed = page.waitForResponse(
			async (response) => response.url().includes("/_serverFn/") && (await response.text().catch(() => "")).includes('"availableTags"'),
			{ timeout: 90_000 },
		);
		await refreshed;
		await page.waitForTimeout(500);
		await expectPage(page, slice(ascending, 1), 23, 1);
	});

	test("E2E-VPAG-010: the footer fits at every breakpoint and in dark mode", async ({ page }) => {
		for (const width of [375, 768, 1280, 1400]) {
			await page.setViewportSize({ width, height: 900 });
			await open(page);
			await pager(page).scrollIntoViewIfNeeded();
			await expect(rangeText(page)).toHaveText("1–10 of 23");
			await withinViewport(previous(page), page);
			await withinViewport(next(page), page);
			await noHorizontalOverflow(page);
			await screenshot(page, `06-width-${width}`);
		}

		await page.emulateMedia({ colorScheme: "dark" });
		for (const width of [1400, 375]) {
			await page.setViewportSize({ width, height: 900 });
			await open(page);
			await page.evaluate(() => document.documentElement.classList.add("dark"));
			await pager(page).scrollIntoViewIfNeeded();
			await expect(next(page)).toBeVisible();
			await noHorizontalOverflow(page);
			const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
			expect(bg).not.toBe("rgb(255, 255, 255)");
			await screenshot(page, `07-dark-${width}`);
		}
	});
});
