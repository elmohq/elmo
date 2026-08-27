/**
 * Issuing an API key from the dashboard, and what the key can then do.
 *
 * The Bruno suite authenticates as keys the seeder wrote straight into the
 * table, which says nothing about whether the product can mint one. This is the
 * other half: a key created through the page has to carry exactly the scopes
 * and the brand narrowing that were ticked, and revoking it has to stop it
 * working immediately.
 *
 * Shared across modes on purpose — demo refuses the write, and this is where
 * that would show up if the page ever bypassed the server function.
 */
import { expect, test } from "@playwright/test";
import { NIKE_BRAND_ID, TEST_BRAND_ID } from "../../fixtures";

const KEYS_PAGE = `/app/${TEST_BRAND_ID}/settings/api-keys`;

type Page = import("@playwright/test").Page;

/**
 * Tick one scope. The checkboxes are grouped by resource and named only by
 * their action, so "write" alone is ambiguous — scope the lookup to the group.
 */
async function tickScope(page: Page, resource: string, action: string) {
  const group = page.locator("div.rounded.border").filter({ has: page.getByText(resource, { exact: true }) });
  await group.getByRole("checkbox", { name: action, exact: true }).first().click();
}

test.describe("API keys", () => {
  test("a key issued from the page carries exactly what was ticked", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name === "demo", "demo refuses every write; covered by the Bruno demo suite");

    await page.goto(KEYS_PAGE, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();

    // Fill until it sticks: React re-renders the controlled inputs on hydration,
    // and a value typed before that is silently discarded.
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

    // Shown exactly once, because only the hash is stored.
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
    expect(identity.scopes).not.toContain("prompts:delete");

    // A scope it holds, and one it doesn't.
    const allowed = await request.get(`/api/v1/brands/${TEST_BRAND_ID}/summary?lookback=1y`, { headers: auth });
    expect(allowed.status()).toBe(200);

    const refused = await request.delete("/api/v1/prompts/00000000-0000-0000-0000-000000000001", {
      headers: auth,
      failOnStatusCode: false,
    });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).code).toBe("insufficient_scope");

    // The other tenant is invisible, not forbidden.
    const other = await request.get(`/api/v1/brands/${NIKE_BRAND_ID}`, { headers: auth, failOnStatusCode: false });
    expect(other.status()).toBe(404);

    // Revoking takes effect on the next request, not on the next deploy.
    await page.reload({ waitUntil: "networkidle" });
    const row = page.locator("div.p-3").filter({ hasText: name });
    await expect(async () => {
      await row.getByRole("button", { name: "Revoke" }).click();
      await expect(row).toHaveCount(0, { timeout: 2_000 });
    }).toPass({ timeout: 30_000 });

    const afterRevoke = await request.get("/api/v1/me", { headers: auth, failOnStatusCode: false });
    expect(afterRevoke.status()).toBe(401);
  });
});
