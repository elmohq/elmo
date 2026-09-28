/**
 * F04-CORR-IT-001 — the editor's save is one transaction: when a later write
 * fails, an earlier write in the same save is rolled back too, and the user
 * is told the save failed.
 *
 * The failure is real. A BEFORE INSERT trigger, installed only in this
 * disposable test database for the duration of the spec, rejects exactly one
 * sentinel prompt value. The save then carries an update to a seeded prompt
 * (updates run first in the transaction), a valid new prompt, and the sentinel
 * prompt (inserts run last, as one statement).
 */
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { brandUrl, DATABASE_URL, PROMPT_IDS, TEST_BRAND_ID } from "../../fixtures";

// The canary rides inside the sentinel value: it may appear in an input's
// value, never in rendered text, the alert, the console or a response body.
const CANARY = `F04_R2_SECRET_CANARY_${Date.now()}`;
const SENTINEL = `F04-CORR-IT-001 sentinel ${CANARY}`;
const VALID_NEW = `F04-CORR-IT-001 valid ${Date.now()}`;
const TRIGGER = "f04_corr_it001_reject_sentinel";
const FUNCTION = "f04_corr_it001_reject_sentinel_fn";

const visiblePromptInputs = (page: Page) => page.getByPlaceholder("Enter prompt text...").filter({ visible: true });

/**
 * Adds a new row through "Add Prompt" (it appears at the top of the page) and
 * fills its text and one tag. The click is retried because under load the page
 * can still be hydrating when the button first renders.
 */
async function addPromptRow(page: Page, value: string, tag: string) {
  const before = await visiblePromptInputs(page).count();
  await expect(async () => {
    await page.getByRole("button", { name: /^add prompt$/i }).click();
    await expect(visiblePromptInputs(page)).toHaveCount(before + 1, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await visiblePromptInputs(page).first().fill(value);
  const row = page.locator("div.md\\:grid").filter({ has: page.getByPlaceholder("Enter prompt text...") }).first();
  await row.getByRole("combobox").last().click();
  await page.getByPlaceholder("Search or create tag...").fill(tag);
  await page.getByRole("option", { name: new RegExp(`add .*${tag}`, "i") }).click();
  await page.keyboard.press("Escape");
  await expect(row.getByRole("button", { name: `Remove ${tag}`, exact: true })).toBeVisible();
}

test.describe("Prompt save rolls back as a whole", () => {
  test.describe.configure({ mode: "serial" });

  let client: pg.Client;
  let baselineTags: string[];
  let nikeBefore: unknown[];

  test.beforeAll(async () => {
    const host = new URL(DATABASE_URL).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`refusing non-loopback database ${host}`);
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    const fixture = await client.query("SELECT tags FROM prompts WHERE id = $1 AND brand_id = $2", [
      PROMPT_IDS.branded1,
      TEST_BRAND_ID,
    ]);
    if (fixture.rows.length !== 1) throw new Error("seeded fixture missing — not the disposable test database");
    baselineTags = fixture.rows[0].tags;
    nikeBefore = (await client.query("SELECT id, value, tags FROM prompts WHERE brand_id = 'nike' ORDER BY id")).rows;

    await client.query(`
      CREATE FUNCTION ${FUNCTION}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.value = '${SENTINEL}' THEN
          RAISE EXCEPTION 'F04-CORR-IT-001: injected failure for the sentinel prompt';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER ${TRIGGER} BEFORE INSERT ON prompts FOR EACH ROW EXECUTE FUNCTION ${FUNCTION}();
    `);
  });

  test.afterAll(async () => {
    try {
      await client.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON prompts`);
      await client.query(`DROP FUNCTION IF EXISTS ${FUNCTION}()`);
      // The retry at the end of the spec saves the batch; remove it again.
      const leftovers = await client.query("SELECT id FROM prompts WHERE value = ANY($1::text[])", [[SENTINEL, VALID_NEW]]);
      if (leftovers.rows.length > 0) {
        const ids = leftovers.rows.map((r) => r.id);
        await client.query("DELETE FROM pgboss.job WHERE name = 'process-prompt' AND data->>'promptId' = ANY($1::text[])", [ids]);
        await client.query("DELETE FROM prompts WHERE id = ANY($1::uuid[])", [ids]);
      }
      await client.query("UPDATE prompts SET tags = $1 WHERE id = $2", [baselineTags, PROMPT_IDS.branded1]);
      const triggers = await client.query("SELECT 1 FROM pg_trigger WHERE tgname = $1", [TRIGGER]);
      expect(triggers.rows).toHaveLength(0);
      // Other specs add and remove their own rows in this brand concurrently,
      // so the proof of "nothing left behind" is scoped to this spec's rows.
      expect((await client.query("SELECT count(*)::int AS n FROM prompts WHERE value LIKE 'F04-CORR-IT-001 %'")).rows[0].n).toBe(0);
    } finally {
      await client.end();
    }
  });

  test("an earlier tag update is undone when a later insert in the same save fails", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleText: string[] = [];
    page.on("console", (m) => consoleText.push(m.text()));
    page.on("pageerror", (e) => consoleText.push(e.message));
    const serverFnBodies: string[] = [];
    page.on("response", async (res) => {
      if (res.url().includes("/_serverFn/")) serverFnBodies.push(await res.text().catch(() => ""));
    });
    await page.goto(`${brandUrl()}/settings/prompts`);
    await expect(page.getByPlaceholder("Enter prompt text...").first()).toBeAttached();

    // Earlier write: add a tag to the seeded prompt through its own tags combobox.
    const seeded = (await client.query("SELECT value FROM prompts WHERE id = $1", [PROMPT_IDS.branded1])).rows[0].value;
    const inputs = page.getByPlaceholder("Enter prompt text...").filter({ visible: true });
    const idx = await inputs.evaluateAll((els, w) => els.findIndex((el) => (el as HTMLInputElement).value === w), seeded);
    expect(idx).toBeGreaterThanOrEqual(0);
    const row = page.locator("div.md\\:grid").filter({ has: page.getByPlaceholder("Enter prompt text...") }).nth(idx);
    await row.getByRole("combobox").last().click();
    await page.getByPlaceholder("Search or create tag...").fill("rolled-back");
    await page.getByRole("option", { name: /add .*rolled-back/i }).click();
    await page.keyboard.press("Escape");
    await expect(row.getByRole("button", { name: "Remove rolled-back", exact: true })).toBeVisible();

    // Later writes: one valid new prompt and the sentinel, in the same save.
    await addPromptRow(page, VALID_NEW, "ok");
    await addPromptRow(page, SENTINEL, "boom");
    const unsavedBar = page.getByText("Unsaved changes", { exact: true });
    await expect(unsavedBar).toBeVisible();

    await page.getByRole("button", { name: /save changes/i }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 60_000 });
    // SE-001 — the user sees the safe message and nothing of the database error.
    await expect(alert).toHaveText("Failed to save prompts. Your changes were not saved. Please try again.");
    const leaks = ["Failed query", "insert into", '"prompts"', "params", CANARY, "DrizzleQueryError"];
    const bodyText = (await page.locator("body").textContent()) ?? "";
    for (const leak of leaks) expect(bodyText, `page text leaks ${leak}`).not.toContain(leak);
    await expect.poll(() => serverFnBodies.length).toBeGreaterThan(0);
    for (const body of serverFnBodies) for (const leak of leaks) expect(body, `response body leaks ${leak}`).not.toContain(leak);
    for (const line of consoleText) for (const leak of leaks) expect(line, `console leaks ${leak}`).not.toContain(leak);
    // The edits are still there for the user to fix or discard.
    await expect(unsavedBar).toBeVisible();
    await expect(page.getByRole("button", { name: /save changes/i })).toBeEnabled();

    // Nothing from the batch reached the database.
    const seededAfter = await client.query("SELECT tags FROM prompts WHERE id = $1", [PROMPT_IDS.branded1]);
    expect(seededAfter.rows[0].tags).toEqual(baselineTags);
    const batch = await client.query("SELECT value FROM prompts WHERE value = ANY($1::text[])", [[SENTINEL, VALID_NEW]]);
    expect(batch.rows).toEqual([]);
    expect((await client.query("SELECT id, value, tags FROM prompts WHERE brand_id = 'nike' ORDER BY id")).rows).toEqual(
      nikeBefore,
    );
    const scheduled = await client.query(
      "SELECT count(*)::int AS n FROM pgboss.job WHERE name = 'process-prompt' AND data->>'promptId' NOT IN (SELECT id::text FROM prompts) AND created_on > now() - interval '2 minutes'",
    );
    expect(scheduled.rows[0].n).toBe(0);

    // With the fault gone, the same staged edits save on retry.
    await client.query(`DROP TRIGGER IF EXISTS ${TRIGGER} ON prompts`);
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(unsavedBar).toBeHidden({ timeout: 60_000 });
    const saved = await client.query("SELECT value, tags FROM prompts WHERE value = ANY($1::text[]) ORDER BY value", [
      [SENTINEL, VALID_NEW],
    ]);
    expect(saved.rows).toEqual([
      { value: SENTINEL, tags: ["boom"] },
      { value: VALID_NEW, tags: ["ok"] },
    ]);
    expect((await client.query("SELECT tags FROM prompts WHERE id = $1", [PROMPT_IDS.branded1])).rows[0].tags).toEqual([
      ...baselineTags,
      "rolled-back",
    ]);
    await page.reload();
    await expect(page.getByPlaceholder("Enter prompt text...").first()).toBeAttached();
    await expect(page.getByRole("button", { name: "Remove rolled-back", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove ok", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove boom", exact: true })).toBeVisible();
  });
});
