/**
 * The Bruno suite authenticates as keys the seeder wrote straight into the
 * table, which says nothing about whether the product can mint one.
 */
import { expect, test } from "../../test";
import { NIKE_BRAND_ID, TEST_BRAND_ID, organizationUrl } from "../../fixtures";

const KEYS_PAGE = `${organizationUrl()}/settings/api-keys`;

type Page = import("@playwright/test").Page;

/** The checkboxes are named only by their action, so the lookup is scoped to
 * the resource group. */
async function tickScope(page: Page, resource: string, action: string) {
  const group = page.locator("div.rounded.border").filter({ has: page.getByText(resource, { exact: true }) });
  await group.getByRole("checkbox", { name: action, exact: true }).first().click();
}

test.describe("API keys", () => {
  test("a key issued from the page carries exactly what was ticked", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === "demo", "demo refuses every write; covered by the Bruno demo suite");

    await page.goto(KEYS_PAGE, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();

    // A value typed before hydration is silently discarded.
    const nameField = page.locator("#key-name");
    const name = `Playwright key ${Date.now()}`;
    await expect(async () => {
      await nameField.fill(name);
      await expect(nameField).toHaveValue(name, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole("button", { name: "Read only" }).click();
    await tickScope(page, "prompts", "write");
    await page.getByRole("checkbox", { name: "Restrict this key to specific brands" }).first().click();
    await page.getByRole("checkbox", { name: "Test Organization", exact: true }).first().click();
    await page.getByRole("button", { name: "Create key", exact: true }).click();

    const secret = page.locator("code.font-mono").first();
    await expect(secret).toBeVisible({ timeout: 30_000 });
    const key = (await secret.textContent())?.trim() ?? "";
    expect(key).toMatch(/^elmo_/);
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

    // Playwright dismisses dialogs unless something is listening, which would
    // make the click a no-op and leave the key live.
    page.on("dialog", (dialog) => dialog.accept());
    await page.reload({ waitUntil: "networkidle" });
    const row = page.locator("div.p-3").filter({ hasText: name });
    await expect(async () => {
      await row.getByRole("button", { name: "Revoke" }).click();
      await expect(row).toHaveCount(0, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    const afterRevoke = await request.get("/api/v1/me", { headers: auth, failOnStatusCode: false });
    expect(afterRevoke.status()).toBe(401);
  });

  test("a restriction that names no brand is refused, not read as all brands", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "demo", "demo refuses every write; covered by the Bruno demo suite");

    await page.goto(KEYS_PAGE, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();

    const nameField = page.locator("#key-name");
    const name = `Empty restriction ${Date.now()}`;
    await expect(async () => {
      await nameField.fill(name);
      await expect(nameField).toHaveValue(name, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });

    // Must not quietly become "every brand"; the server is what refuses.
    await page.getByRole("button", { name: "Read only" }).click();
    await page.getByRole("checkbox", { name: "Restrict this key to specific brands" }).first().click();
    await page.getByRole("button", { name: "Create key", exact: true }).click();

    await expect(page.getByText(/at least one brand/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(name)).toBeHidden();
  });
});
