/**
 * The paged prompt catalog and its import, end to end on the local test stack
 * with the worker down: Review writes nothing, Commit writes everything as
 * disabled and queues no job, the page filters and saves a delta, enabling a
 * prompt gives it exactly one chain, and leaving with edits asks first.
 *
 * Everything this adds is removed through the public API at the end so the
 * seeded fixtures other specs assert on are left as they were.
 */
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { brandUrl, DATABASE_URL, TEST_API_KEY, TEST_BRAND_ID } from "../../fixtures";

const NEW_PROMPTS = {
  // Mentions the seeded brand's domain, so the server must compute `branded`
  // on its own while the pasted user tags stay user tags.
  branded: "Is example.com a good legal insurance provider?",
  compare: "What should I compare before buying legal insurance?",
  legacy: "Which legal insurance is best for a family?",
} as const;

// The paste also repeats a seeded prompt (case and spacing changed) and has a
// blank line, both of which are reported and never written.
const PASTE = [
  `${NEW_PROMPTS.branded};Insurance;comparison;; INSURANCE ;family`,
  "",
  `${NEW_PROMPTS.compare};insurance;Buying Guide`,
  "COMPARE  AI VISIBILITY PLATFORMS and their features;dup-tag",
  NEW_PROMPTS.legacy,
].join("\n");

const EXPECTED_TAGS: Record<keyof typeof NEW_PROMPTS, string[]> = {
  branded: ["insurance", "comparison", "family"],
  compare: ["insurance", "buying guide"],
  legacy: [],
};

type PromptRow = { id: string; value: string; tags: string[]; system_tags: string[]; enabled: boolean };

async function promptRows(client: pg.Client): Promise<PromptRow[]> {
  const { rows } = await client.query<PromptRow>(
    "SELECT id, value, tags, system_tags, enabled FROM prompts WHERE brand_id = $1 AND value = ANY($2::text[]) ORDER BY value",
    [TEST_BRAND_ID, Object.values(NEW_PROMPTS)],
  );
  return rows;
}

async function brandPromptCount(client: pg.Client): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM prompts WHERE brand_id = $1",
    [TEST_BRAND_ID],
  );
  return rows[0].n;
}

/**
 * Pending `process-prompt` jobs per prompt id — the canonical chain each
 * enabled prompt owns. The web process creates the pgboss schema on its first
 * send, and a stack that has only ever imported disabled prompts has never
 * sent: no schema means no jobs.
 */
async function pendingChains(client: pg.Client, promptIds: string[]): Promise<Map<string, number>> {
  const schema = await client.query("SELECT to_regclass('pgboss.job') IS NOT NULL AS present");
  if (!schema.rows[0].present) return new Map();
  const { rows } = await client.query<{ prompt_id: string; n: number }>(
    `SELECT data->>'promptId' AS prompt_id, COUNT(*)::int AS n
       FROM pgboss.job
      WHERE name = 'process-prompt' AND state IN ('created', 'retry', 'active')
        AND data->>'promptId' = ANY($1::text[])
      GROUP BY 1`,
    [promptIds],
  );
  return new Map(rows.map((r) => [r.prompt_id, r.n]));
}

/**
 * The editor renders every row twice (stacked mobile block + desktop grid).
 * DOM-level counts see both; role queries only see the visible desktop copy.
 */
const LAYOUTS = 2;

const promptInputs = (page: Page) => page.getByPlaceholder("Enter prompt text...");

const countPromptInputs = (page: Page, value: string) =>
  promptInputs(page).evaluateAll(
    (els, wanted) => els.filter((el) => (el as HTMLInputElement).value === wanted).length,
    value,
  );

async function expectPromptRows(page: Page, value: string, rows: number) {
  await expect.poll(() => countPromptInputs(page, value)).toBe(rows * LAYOUTS);
}

/** The visible prompt input holding `value`, for editing it, and its row index. */
async function promptInput(page: Page, value: string) {
  const visible = promptInputs(page).filter({ visible: true });
  const index = await visible.evaluateAll(
    (els, wanted) => els.findIndex((el) => (el as HTMLInputElement).value === wanted),
    value,
  );
  expect(index, `no visible prompt input holds "${value}"`).toBeGreaterThanOrEqual(0);
  return { input: visible.nth(index), index };
}

/** The desktop grid row holding the visible prompt input at `index`. */
function desktopRow(page: Page, index: number) {
  return page.locator("div.md\\:grid").filter({ has: page.getByPlaceholder("Enter prompt text...") }).nth(index);
}

/**
 * Opens the import panel. The click is retried because under load the
 * settings page can still be hydrating when the button first renders, and a
 * click that lands before React attaches its handlers does nothing.
 */
async function openImport(page: Page) {
  const textarea = page.getByRole("textbox", { name: /prompts to import/i });
  await expect(async () => {
    await page.getByRole("button", { name: /^import prompts$/i }).click();
    await expect(textarea).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return textarea;
}

async function expectTagChips(page: Page, expectedCounts: Record<string, number>) {
  for (const [tag, rows] of Object.entries(expectedCounts)) {
    await expect(page.getByRole("button", { name: `Remove ${tag}`, exact: true })).toHaveCount(rows);
  }
}

const searchBox = (page: Page) => page.getByRole("textbox", { name: /search prompt text/i });

test.describe("Prompt catalog import and paging", () => {
  test.describe.configure({ mode: "serial" });

  let client: pg.Client;
  let countBefore: number;
  const createdIds: string[] = [];

  test.beforeAll(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    countBefore = await brandPromptCount(client);
  });

  test.afterAll(async ({ request }) => {
    for (const id of createdIds) {
      const res = await request.delete(`/api/v1/prompts/${id}`, {
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(res.ok(), `cleanup of ${id}: ${res.status()}`).toBeTruthy();
    }
    if (createdIds.length > 0 && (await pendingChains(client, createdIds)).size > 0) {
      await client.query("DELETE FROM pgboss.job WHERE name = 'process-prompt' AND data->>'promptId' = ANY($1::text[])", [
        createdIds,
      ]);
    }
    expect(await brandPromptCount(client)).toBe(countBefore);
    await client.end();
  });

  test("review, commit as disabled, reload, edit a delta, then enable one prompt", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(`${brandUrl()}/settings/prompts`);
    await expect(promptInputs(page).first()).toBeAttached();
    await expect(page.getByTestId("catalog-capacity")).toHaveText(new RegExp(`^${countBefore}/10,000 prompts in this brand`));

    // The syntax is discoverable and the textarea has an accessible name.
    const textarea = await openImport(page);
    await expect(textarea).toHaveAccessibleName(/prompts to import, one per line.*semicolons/i);
    await expect(textarea).toHaveAccessibleDescription(/Prompt text;tag1;tag2/);
    await expect(page.getByRole("radio", { name: /add as disabled/i })).toBeChecked();

    // Typing parses nothing and enables nothing; Review reports exact totals.
    await textarea.fill(PASTE);
    await expect(page.getByRole("button", { name: /^import$/i })).toBeDisabled();
    await page.getByRole("button", { name: /^review$/i }).click();
    const review = page.getByTestId("prompt-import-review");
    await expect(review).toContainText("3 prompts will be added as disabled out of 5 lines");
    await expect(review).toContainText("Skipped 1 blank line");
    await expect(review).toContainText("Skipped 1 duplicate of prompts already in the list");
    await expect(review).toContainText("COMPARE  AI VISIBILITY PLATFORMS and their features");
    expect(await brandPromptCount(client)).toBe(countBefore);
    expect(await promptRows(client)).toEqual([]);

    // Commit writes all three as disabled with normalized tags and server-computed system tags.
    await page.getByRole("button", { name: /^import 3 prompts$/i }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 3 prompts as disabled." })).toBeVisible({
      timeout: 30_000,
    });
    const rows = await promptRows(client);
    expect(rows).toHaveLength(3);
    expect(await brandPromptCount(client)).toBe(countBefore + 3);
    const byValue = new Map(rows.map((r) => [r.value, r]));
    for (const [key, value] of Object.entries(NEW_PROMPTS) as [keyof typeof NEW_PROMPTS, string][]) {
      const row = byValue.get(value);
      expect(row, value).toBeDefined();
      expect(row!.tags).toEqual(EXPECTED_TAGS[key]);
      expect(row!.enabled).toBe(false);
      createdIds.push(row!.id);
    }
    expect(byValue.get(NEW_PROMPTS.branded)!.system_tags).toEqual(["branded"]);
    expect(byValue.get(NEW_PROMPTS.compare)!.system_tags).toEqual(["unbranded"]);
    expect(byValue.get(NEW_PROMPTS.legacy)!.system_tags).toEqual(["unbranded"]);

    // Disabled imports own no chain.
    expect(await pendingChains(client, createdIds)).toEqual(new Map());

    // The page re-read itself after the import: rows and chips are on screen and survive a reload.
    for (const value of Object.values(NEW_PROMPTS)) await expectPromptRows(page, value, 1);
    await expectTagChips(page, { insurance: 2, comparison: 2, family: 1, "buying guide": 1 });
    await expect(page.getByRole("button", { name: /Remove INSURANCE/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove dup-tag", exact: true })).toHaveCount(0);
    await page.reload();
    for (const value of Object.values(NEW_PROMPTS)) await expectPromptRows(page, value, 1);
    await expect(page.getByTestId("catalog-capacity")).toHaveText(
      new RegExp(`^${countBefore + 3}/10,000 prompts in this brand`),
    );

    // A delta save renames one row in place: same id, same count, still no chain.
    const legacy = await promptInput(page, NEW_PROMPTS.legacy);
    await legacy.input.fill(`${NEW_PROMPTS.legacy} today`);
    await legacy.input.blur();
    const saveButton = page.getByRole("button", { name: /save changes/i });
    const unsavedBar = page.getByText("Unsaved changes", { exact: true });
    await expect(unsavedBar).toBeVisible();
    await saveButton.click();
    await expect(unsavedBar).toBeHidden({ timeout: 30_000 });
    expect(await brandPromptCount(client)).toBe(countBefore + 3);
    const { rows: renamed } = await client.query<{ id: string; tags: string[] }>(
      "SELECT id, tags FROM prompts WHERE brand_id = $1 AND value = $2",
      [TEST_BRAND_ID, `${NEW_PROMPTS.legacy} today`],
    );
    expect(renamed).toHaveLength(1);
    expect(createdIds).toContain(renamed[0].id);
    expect(await pendingChains(client, createdIds)).toEqual(new Map());

    // Enabling one prompt through its switch and saving starts exactly one chain for it.
    const compare = await promptInput(page, NEW_PROMPTS.compare);
    await desktopRow(page, compare.index).getByRole("switch", { name: /enable prompt/i }).click();
    await expect(unsavedBar).toBeVisible();
    await saveButton.click();
    await expect(unsavedBar).toBeHidden({ timeout: 30_000 });
    const compareId = byValue.get(NEW_PROMPTS.compare)!.id;
    await expect
      .poll(async () => [...(await pendingChains(client, createdIds)).entries()], { timeout: 15_000 })
      .toEqual([[compareId, 1]]);
    // A round trip that changes nothing saves nothing and adds no second chain.
    await page.reload();
    const compareAgain = await promptInput(page, NEW_PROMPTS.compare);
    await compareAgain.input.fill(`${NEW_PROMPTS.compare} `);
    await compareAgain.input.fill(NEW_PROMPTS.compare);
    await expect(unsavedBar).toBeHidden();
    expect([...(await pendingChains(client, createdIds)).entries()]).toEqual([[compareId, 1]]);
  });

  test("filters are URL state and the counts follow the filter", async ({ page }) => {
    await page.goto(`${brandUrl()}/settings/prompts?tag=buying%20guide`);
    await expectPromptRows(page, NEW_PROMPTS.compare, 1);
    await expectPromptRows(page, NEW_PROMPTS.branded, 0);
    await expect(page.getByTestId("catalog-range")).toHaveText("Showing 1–1 of 1 matching prompts");

    await page.goto(`${brandUrl()}/settings/prompts?status=disabled&q=LEGAL%20INSURANCE`);
    await expectPromptRows(page, NEW_PROMPTS.branded, 1);
    await expectPromptRows(page, `${NEW_PROMPTS.legacy} today`, 1);
    await expectPromptRows(page, NEW_PROMPTS.compare, 0);
    await expect(page.getByTestId("catalog-range")).toHaveText("Showing 1–2 of 2 matching prompts");

    // The toolbar writes the same URL state.
    await page.getByRole("button", { name: /clear filters/i }).click();
    await expect(page).toHaveURL(/settings\/prompts\/?$/);
    await searchBox(page).fill("family");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=family/);
    await expectPromptRows(page, `${NEW_PROMPTS.legacy} today`, 1);
    await expectPromptRows(page, NEW_PROMPTS.compare, 0);
  });

  test("a line with tags but no prompt blocks the whole import and names the line", async ({ page }) => {
    await page.goto(`${brandUrl()}/settings/prompts`);
    const textarea = await openImport(page);
    await textarea.fill("fine prompt;tag\n;orphan\n  ;a;b");
    await page.getByRole("button", { name: /^review$/i }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Lines 2 and 3 have no prompt text before their first semicolon. Fix or remove them to continue.",
    );
    await expect(page.getByRole("button", { name: /^import 1 prompt$/i })).toBeDisabled();
    // The text is still there to fix.
    await expect(textarea).toHaveValue("fine prompt;tag\n;orphan\n  ;a;b");
    expect(await brandPromptCount(client)).toBe(countBefore + 3);
  });

  test("leaving a page with unsaved edits offers Save, Discard and Cancel", async ({ page }) => {
    await page.goto(`${brandUrl()}/settings/prompts`);
    const branded = await promptInput(page, NEW_PROMPTS.branded);
    await branded.input.fill(`${NEW_PROMPTS.branded} (edited)`);
    await branded.input.blur();
    await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();

    // A filter change is a navigation: the guard asks first.
    await searchBox(page).fill("legal");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: /save changes before leaving/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^cancel$/i })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^save and leave$/i })).toBeVisible();
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/q=legal/);
    await expectPromptRows(page, `${NEW_PROMPTS.branded} (edited)`, 1);

    // Discard: the edit is gone and the navigation goes through.
    await searchBox(page).fill("legal");
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").getByRole("button", { name: /^discard and leave$/i }).click();
    await expect(page).toHaveURL(/q=legal/);
    await expectPromptRows(page, NEW_PROMPTS.branded, 1);
    const { rows } = await client.query(
      "SELECT value FROM prompts WHERE id = ANY($1::uuid[]) AND value LIKE '%(edited)'",
      [createdIds],
    );
    expect(rows).toEqual([]);
  });
});
