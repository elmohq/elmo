/**
 * Bulk operations on the prompt catalog, end to end on the local test stack
 * with the worker down: select a page and every match of a filter, lose the
 * selection when the filter changes, disable and enable with previews, delete
 * only disabled prompts behind the typed phrase, remove a tag from the brand.
 *
 * Everything happens in a brand this spec creates inside the test org, so the
 * seeded brand other specs run against concurrently is never touched.
 */
import { expect, type Page, test } from "@playwright/test";
import pg from "pg";
import { brandUrl, DATABASE_URL, TEST_ORG_SLUG } from "../../fixtures";

const BRAND_ID = "bulk-e2e-brand";
const TAG = "bulk-e2e";
const TOPIC = "bulk-e2e-topic";
const COUNT = 120; // three pages at fifty per page

async function pgbossPresent(client: pg.Client) {
  return (await client.query("select to_regclass('pgboss.job') is not null as present")).rows[0].present as boolean;
}
async function pendingChains(client: pg.Client, ids: string[]) {
  if (!(await pgbossPresent(client))) return 0;
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from pgboss.job where name = 'process-prompt' and state in ('created','retry','active') and data->>'promptId' = any($1::text[])`,
    [ids],
  );
  return rows[0].n;
}
async function tagged(client: pg.Client) {
  const { rows } = await client.query<{ id: string; enabled: boolean; tags: string[] }>(
    "select id, enabled, tags from prompts where brand_id = $1 and $2 = any(tags) order by value",
    [BRAND_ID, TAG],
  );
  return rows;
}

async function openImport(page: Page) {
  const textarea = page.getByRole("textbox", { name: /prompts to import/i });
  await expect(async () => {
    await page.getByRole("button", { name: /^import prompts$/i }).click();
    await expect(textarea).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return textarea;
}
const selectionCount = (page: Page) => page.getByTestId("selection-count");

/** Open a bulk dialog and wait for its preview; the click is retried because under load it can land mid re-render. */
async function openDialog(page: Page, button: ReturnType<Page["getByRole"]>, previewTestId: string) {
  await expect(async () => {
    await button.click();
    await expect(page.getByTestId(previewTestId)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  return page.getByTestId(previewTestId);
}
const headerCheckbox = (page: Page) => page.getByRole("checkbox", { name: /select all prompts|deselect all prompts/i });

/** Navigate and wait until the page is hydrated: a click that lands before React owns the checkboxes is lost. */
async function open(page: Page, url: string) {
  await page.goto(url);
  await page.getByTestId("catalog-range").waitFor();
  await page.waitForLoadState("networkidle");
}

test.describe("Prompt catalog bulk operations", () => {
  test.describe.configure({ mode: "serial" });
  let client: pg.Client;

  test.beforeAll(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(
      `insert into brands (id, organization_id, slug, name, website, enabled, onboarded, created_at, updated_at)
       values ($1, $2, $1, 'Bulk E2E Brand', 'https://bulk-e2e.example', true, true, now(), now()) on conflict (id) do nothing`,
      [BRAND_ID, TEST_ORG_SLUG],
    );
  });
  test.afterAll(async () => {
    // Belt and braces: whatever the UI did not delete goes through SQL, then the brand itself.
    const ids = (await client.query<{ id: string }>("select id from prompts where brand_id = $1", [BRAND_ID])).rows.map((r) => r.id);
    if (ids.length > 0) {
      if (await pgbossPresent(client)) await client.query("delete from pgboss.job where name='process-prompt' and data->>'promptId' = any($1::text[])", [ids]);
      await client.query("delete from prompts where id = any($1::uuid[])", [ids]);
    }
    await client.query("delete from brands where id = $1", [BRAND_ID]);
    await client.end();
  });

  test("import a three-page fixture as disabled", async ({ page }) => {
    await open(page, `${brandUrl(BRAND_ID)}/settings/prompts`);
    const textarea = await openImport(page);
    const lines = Array.from({ length: COUNT }, (_, i) => `Bulk e2e prompt ${String(i).padStart(3, "0")};${TAG}${i % 4 === 0 ? `;${TOPIC}` : ""}`);
    await textarea.fill(lines.join("\n"));
    await page.getByRole("button", { name: /^review$/i }).click();
    await expect(page.getByTestId("prompt-import-review")).toContainText(`${COUNT} prompts will be added as disabled`);
    await page.getByRole("button", { name: new RegExp(`^import ${COUNT} prompts$`, "i") }).click();
    await expect(page.getByRole("status").filter({ hasText: `Imported ${COUNT} prompts as disabled.` })).toBeVisible({ timeout: 60_000 });
    expect((await tagged(client)).length).toBe(COUNT);
  });

  test("select the page, then every match; the selection survives paging and dies with the filter", async ({ page }) => {
    await open(page, `${brandUrl(BRAND_ID)}/settings/prompts?tag=${TAG}`);
    await expect(page.getByTestId("catalog-range")).toHaveText(`Showing 1–50 of ${COUNT} matching prompts`);
    await expect(page.getByTestId("selection-bar")).toBeHidden();

    await headerCheckbox(page).click();
    await expect(selectionCount(page)).toHaveText("50");
    // Pager clicks are retried: under load a click can land on a button mid-re-render and do nothing.
    await expect(async () => {
      await page.getByRole("button", { name: /^next$/i }).click();
      await expect(page).toHaveURL(/page=2/, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(selectionCount(page)).toHaveText("50");
    await expect(headerCheckbox(page)).not.toBeChecked();
    await expect(async () => {
      await page.getByRole("button", { name: /^previous$/i }).click();
      await expect(page).not.toHaveURL(/page=2/, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(headerCheckbox(page)).toBeChecked();

    await page.getByRole("button", { name: new RegExp(`select all ${COUNT} matching`, "i") }).click();
    await expect(selectionCount(page)).toHaveText(String(COUNT));

    // Changing the filter clears the selection.
    await page.getByRole("textbox", { name: /search prompt text/i }).fill("prompt 00");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=prompt/);
    await expect(page.getByTestId("selection-bar")).toBeHidden();
    await page.getByRole("button", { name: /clear filters/i }).click();
  });

  test("enable a page with a preview, then disable everything; chains follow", async ({ page }) => {
    await open(page, `${brandUrl(BRAND_ID)}/settings/prompts?tag=${TAG}`);
    await headerCheckbox(page).click();
    const preview = await openDialog(page, page.getByTestId("selection-bar").getByRole("button", { name: /^enable$/i }), "bulk-status-preview");
    await expect(preview).toContainText("50 will be enabled");
    await expect(preview).toContainText("50 run chains will start, spread over the next");
    await expect(preview).toContainText("paid provider answer");
    await page.getByTestId("bulk-status-commit").click();
    await expect(page.getByTestId("catalog-notice")).toHaveText("50 prompts enabled.", { timeout: 60_000 });
    await expect(page.getByTestId("selection-bar")).toBeHidden();
    const rows = await tagged(client);
    const enabledIds = rows.filter((r) => r.enabled).map((r) => r.id);
    expect(enabledIds).toHaveLength(50);
    await expect.poll(() => pendingChains(client, enabledIds), { timeout: 30_000 }).toBe(50);
    const starts = (await client.query<{ s: Date }>("select start_after as s from pgboss.job where name='process-prompt' and state='created' and data->>'promptId' = any($1::text[])", [enabledIds])).rows;
    expect(new Set(starts.map((r) => r.s.getTime())).size).toBeGreaterThan(40);

    // Disable all 120: 50 flip (their chains are cancelled), 70 are already disabled.
    await headerCheckbox(page).click();
    await page.getByRole("button", { name: new RegExp(`select all ${COUNT} matching`, "i") }).click();
    await openDialog(page, page.getByTestId("selection-bar").getByRole("button", { name: /^disable$/i }), "bulk-status-preview");
    await expect(page.getByTestId("bulk-status-preview")).toContainText("50 will be disabled; 70 already disabled and left as is.");
    await expect(page.getByTestId("bulk-status-preview")).toContainText("50 queued runs will be cancelled");
    await page.getByTestId("bulk-status-commit").click();
    await expect(page.getByTestId("catalog-notice")).toHaveText("50 prompts disabled.", { timeout: 60_000 });
    expect((await tagged(client)).every((r) => !r.enabled)).toBe(true);
    expect(await pendingChains(client, enabledIds)).toBe(0);

    // Repeating is a no-op.
    await headerCheckbox(page).click();
    await openDialog(page, page.getByTestId("selection-bar").getByRole("button", { name: /^disable$/i }), "bulk-status-preview");
    await expect(page.getByTestId("bulk-status-preview")).toContainText("0 will be disabled; 50 already disabled");
    await expect(page.getByTestId("bulk-status-commit")).toHaveText("Nothing to change");
    await page.getByRole("dialog").getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("remove the topic tag from the brand behind its phrase", async ({ page }) => {
    await open(page, `${brandUrl(BRAND_ID)}/settings/prompts?tag=${TOPIC}`);
    await expect(page.getByTestId("catalog-range")).toHaveText("Showing 1–30 of 30 matching prompts");
    await openDialog(page, page.getByRole("button", { name: new RegExp(`remove tag “${TOPIC}” from all prompts`, "i") }), "tag-removal-preview");
    await expect(page.getByTestId("tag-removal-preview")).toContainText(`30 prompts carry the tag ${TOPIC}`);
    const commit = page.getByTestId("tag-removal-commit");
    await expect(commit).toBeDisabled();
    await page.getByTestId("tag-removal-phrase").fill(`REMOVE ${TOPIC}`);
    await commit.click();
    await expect(page.getByTestId("catalog-notice")).toHaveText(`Removed the tag “${TOPIC}” from 30 prompts.`, { timeout: 60_000 });
    // The active tag filter was dropped and the page is back on the unfiltered first page.
    await expect(page).not.toHaveURL(/tag=/);
    const rows = await tagged(client);
    expect(rows).toHaveLength(COUNT);
    expect(rows.every((r) => !r.tags.includes(TOPIC) && r.tags.includes(TAG))).toBe(true);
  });

  test("delete the disabled fixture: enabled rows block, the phrase gates, history goes", async ({ page }) => {
    const rows = await tagged(client);
    await client.query("update prompts set enabled = true where id = $1", [rows[0].id]);
    await open(page, `${brandUrl(BRAND_ID)}/settings/prompts?tag=${TAG}`);
    await headerCheckbox(page).click();
    await page.getByRole("button", { name: new RegExp(`select all ${COUNT} matching`, "i") }).click();
    const preview = await openDialog(page, page.getByTestId("selection-bar").getByRole("button", { name: /^delete…$/i }), "bulk-delete-preview");
    await expect(preview).toContainText("1 selected prompt is still enabled. Disable them first.");
    await expect(page.getByTestId("bulk-delete-commit")).toBeDisabled();
    await expect(page.getByTestId("bulk-delete-phrase")).toBeHidden();
    await page.getByRole("dialog").getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await client.query("update prompts set enabled = false where id = $1", [rows[0].id]);

    await openDialog(page, page.getByTestId("selection-bar").getByRole("button", { name: /^delete…$/i }), "bulk-delete-preview");
    await expect(preview).toContainText(`Prompts${COUNT}`);
    await expect(preview).toContainText("Kept: billing records (usage events)");
    const commit = page.getByTestId("bulk-delete-commit");
    await expect(commit).toBeDisabled();
    await page.getByTestId("bulk-delete-phrase").fill(`DELETE ${COUNT} PROMPT`);
    await expect(commit).toBeDisabled();
    await page.getByTestId("bulk-delete-phrase").fill(`DELETE ${COUNT} PROMPTS`);
    await expect(commit).toBeEnabled();
    await commit.click();
    await expect(page.getByTestId("catalog-notice")).toHaveText(`Deleted ${COUNT} prompts and their history.`, { timeout: 60_000 });
    await expect(page.getByTestId("catalog-range")).toHaveText("No prompts match these filters.");
    expect((await tagged(client)).length).toBe(0);
    expect((await client.query<{ n: number }>("select count(*)::int as n from prompts where brand_id = $1", [BRAND_ID])).rows[0].n).toBe(0);
  });
});
