/**
 * The Bruno suite authenticates as keys the seeder wrote straight into the
 * table, which says nothing about whether the product can mint one.
 */
import { expect, test } from "../../test";
import { NIKE_BRAND_ID, TEST_BRAND_ID, organizationUrl } from "../../fixtures";

const KEYS_PAGE = `${organizationUrl()}/settings/api-keys`;

type Page = import("@playwright/test").Page;

/** The grid only exists under the Custom tab, and each box is named
 * `<Resource> <action>`. */
async function tickScope(page: Page, resource: string, action: string) {
  await page.getByRole("tab", { name: "Custom", exact: true }).click();
  await page.getByRole("checkbox", { name: `${resource} ${action}`, exact: true }).first().click();
}

async function openCreateForm(page: Page, name: string) {
  const dialog = page.getByRole("dialog");
  const nameField = page.locator("#key-name");
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "New key" }).click();
    }
    await nameField.fill(name);
    await expect(nameField).toHaveValue(name, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("API keys", () => {
  test("a key issued from the page carries exactly what was ticked", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === "demo", "demo refuses every write; covered by the Bruno demo suite");

    await page.goto(KEYS_PAGE, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();

    const name = `Playwright key ${Date.now()}`;
    await openCreateForm(page, name);
    // A real click, because the failure this guards against was the dialog
    // painting over the open listbox and swallowing them.
    await page.locator("#key-expiry").click();
    await page.getByRole("option", { name: "In 30 days", exact: true }).click();
    await expect(page.locator("#key-expiry")).toContainText("In 30 days");
    await page.getByRole("tab", { name: "Read only", exact: true }).click();
    await tickScope(page, "Prompts", "write");
    await page.getByRole("tab", { name: "Specific brands", exact: true }).click();
    await page.getByRole("checkbox", { name: "Test Organization", exact: true }).first().click();
    await page.getByRole("button", { name: "Create key", exact: true }).click();

    const issued = page.locator("[data-slot=card]").filter({ hasText: "Key created" });
    await expect(issued).toBeVisible({ timeout: 30_000 });
    const key = (await issued.locator("code").innerText()).trim();
    expect(key).toMatch(/^elmo_[A-Za-z]+$/);
    await expect(page.getByText(name)).toBeVisible();

    const auth = { Authorization: `Bearer ${key}` };

    const me = await request.get("/api/v1/me", { headers: auth });
    expect(me.status()).toBe(200);
    const identity = await me.json();
    expect(identity.keyType).toBe("organization");
    expect(identity.brandIds).toEqual([TEST_BRAND_ID]);
    expect(identity.scopes).toContain("prompts:write");
    expect(identity.scopes).not.toContain("competitors:delete");

    const allowed = await request.get(
      `/api/v1/brands/${TEST_BRAND_ID}/analytics?start=2020-03-01T00:00:00Z&end=2020-04-01T00:00:00Z`,
      { headers: auth },
    );
    expect(allowed.status()).toBe(200);

    const refused = await request.delete("/api/v1/competitors/00000000-0000-0000-0000-999999999999", {
      headers: auth,
      failOnStatusCode: false,
    });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).code).toBe("insufficient_scope");

    // Refused because no scope reaches it, so a key ticking every box reads
    // the same way.
    const deletePrompt = await request.delete("/api/v1/prompts/00000000-0000-0000-0000-000000000001", {
      headers: auth,
      failOnStatusCode: false,
    });
    expect(deletePrompt.status()).toBe(403);
    expect((await deletePrompt.json()).code).toBe("forbidden");

    const other = await request.get(`/api/v1/brands/${NIKE_BRAND_ID}`, { headers: auth, failOnStatusCode: false });
    expect(other.status()).toBe(404);

    await page.reload({ waitUntil: "networkidle" });
    const row = page.getByRole("row").filter({ hasText: name });
    const confirm = page.getByRole("dialog");
    await expect(async () => {
      if (!(await confirm.isVisible())) {
        await row.getByRole("button", { name: "Revoke", exact: true }).click();
      }
      await confirm.getByRole("button", { name: "Revoke key", exact: true }).click();
      await expect(confirm).toBeHidden({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });

    // Revoking disables the key rather than deleting it, so the row survives
    // among the inactive ones with nothing left to act on.
    await expect(row.getByText("Revoked")).toBeVisible({ timeout: 30_000 });
    await expect(row.getByRole("button", { name: "Revoke", exact: true })).toHaveCount(0);

    const afterRevoke = await request.get("/api/v1/me", { headers: auth, failOnStatusCode: false });
    expect(afterRevoke.status()).toBe(401);
  });

  test("a restriction that names no brand is refused, not read as all brands", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "demo", "demo refuses every write; covered by the Bruno demo suite");

    await page.goto(KEYS_PAGE, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();

    const name = `Empty restriction ${Date.now()}`;
    await openCreateForm(page, name);

    // Must not quietly become "every brand"; the server is what refuses.
    await page.getByRole("tab", { name: "Read only", exact: true }).click();
    await page.getByRole("tab", { name: "Specific brands", exact: true }).click();
    await page.getByRole("button", { name: "Create key", exact: true }).click();

    await expect(page.getByRole("dialog").getByText(/at least one brand/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
  });
});
