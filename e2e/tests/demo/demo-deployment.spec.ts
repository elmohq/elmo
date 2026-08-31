/**
 * What makes a demo deployment different.
 *
 * Demo is local mode with READ_ONLY forced on: a public, shared instance that
 * anyone can look around but nobody can change. It advertises one set of
 * credentials on the login page, wears a "Demo" pill, and refuses every write.
 *
 * The read-only policy itself is unit-tested as a pure function
 * (apps/web/src/lib/auth/__tests__/policies.test.ts). What these specs add is
 * that the policy is actually wired into the running server, and that a refused
 * write leaves the database untouched — a 403 that still wrote would pass the
 * unit tests.
 */
import { expect, test } from "@playwright/test";
import {
  COMPETITOR_IDS,
  DEMO_CREDENTIALS,
  PROMPT_IDS,
  TEST_API_KEY,
  TEST_BRAND_ID,
  TEST_BRAND_NAME,
  TEST_USER,
  brandUrl,
  organizationUrl,
} from "../../fixtures";
import { withDb } from "../../session";

const authed = { Authorization: `Bearer ${TEST_API_KEY}` };

async function countRows(table: string, where: string, params: unknown[]): Promise<number> {
  return withDb(async (client) => {
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE ${where}`,
      params,
    );
    return Number(rows[0].count);
  });
}

test.describe("Demo refuses writes", () => {
  test("creating a prompt is refused, with a key that would otherwise work", async ({ request }) => {
    const value = "demo mode should never persist this prompt";

    const response = await request.post("/api/v1/prompts", {
      headers: authed,
      data: { brandId: TEST_BRAND_ID, value },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Demo Mode" });
    expect(await countRows("prompts", "value = $1", [value])).toBe(0);
  });

  test("updating a brand is refused and leaves it unchanged", async ({ request }) => {
    const response = await request.patch(`/api/v1/brands/${TEST_BRAND_ID}`, {
      headers: authed,
      data: { name: "Renamed By A Demo Visitor" },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);
    expect(await countRows("brands", "id = $1 AND name = $2", [TEST_BRAND_ID, TEST_BRAND_NAME])).toBe(1);
  });

  test("deleting a competitor is refused and it survives", async ({ request }) => {
    const response = await request.delete(`/api/v1/competitors/${COMPETITOR_IDS.competitorA}`, {
      headers: authed,
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);
    expect(await countRows("competitors", "id = $1", [COMPETITOR_IDS.competitorA])).toBe(1);
  });

  test("reads still work", async ({ request }) => {
    const brands = await request.get("/api/v1/brands", { headers: authed });
    expect(brands.status()).toBe(200);

    const prompt = await request.get(`/api/v1/prompts/${PROMPT_IDS.branded1}`, { headers: authed });
    expect(prompt.status()).toBe(200);
  });

  test("saving brand settings from the UI fails and writes nothing", async ({ page }) => {
    await page.goto(`${brandUrl()}/settings/brand`);

    const nameInput = page.getByLabel("Brand Name");
    await expect(nameInput).toBeVisible({ timeout: 30_000 });
    await nameInput.fill("Renamed From The Settings Page");

    // The save posts to a server function; catching that response is what tells
    // us the write attempt happened and how the server answered it.
    const writeAttempt = page.waitForResponse(
      (response) => response.request().method() === "POST" && !response.url().includes("/api/plausible"),
    );
    await page.getByRole("button", { name: "Save Changes" }).click();
    expect((await writeAttempt).status()).toBe(403);

    await expect(page.getByText("Brand details updated successfully!")).toHaveCount(0);
    await expect(page.getByText("Edits are not allowed in demo mode.")).toBeVisible();
    expect(await countRows("brands", "id = $1 AND name = $2", [TEST_BRAND_ID, TEST_BRAND_NAME])).toBe(1);
  });
});

test.describe("Demo auth is sign-in only", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("signup is refused as a write, before better-auth even sees it", async ({ request }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      data: { email: "visitor@test.local", password: "some-password-123", name: "Visitor" },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Demo Mode" });
    expect(await countRows(`"user"`, "email = $1", ["visitor@test.local"])).toBe(0);
  });

  test("changing the shared account's password is refused", async ({ request }) => {
    // Sign-in and sign-out are the only better-auth writes a demo visitor gets;
    // everything else that could mutate the shared account is blocked.
    const response = await request.post("/api/auth/change-password", {
      data: { currentPassword: TEST_USER.password, newPassword: "hijacked-password-123" },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ error: "Demo Mode" });
  });

  test("sign-in is allowed through", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email: TEST_USER.email, password: TEST_USER.password },
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
  });

  test("the login page advertises the shared demo account", async ({ page }) => {
    await page.goto("/auth/login");

    await expect(page.getByText("Demo Account")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(DEMO_CREDENTIALS.email)).toBeVisible();
    await expect(page.getByText(DEMO_CREDENTIALS.password, { exact: true }).first()).toBeVisible();
    // Credentials are pre-filled, so there is nothing to type in.
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(page.getByLabel("Password")).toHaveCount(0);
  });

  test("the register page sends you to sign in", async ({ page }) => {
    await page.goto("/auth/register");
    await page.waitForURL(/\/auth\/login/, { timeout: 30_000 });
  });
});

test.describe("Demo features", () => {
  test("the demo pill is shown", async ({ page }) => {
    await page.goto(`${brandUrl()}`);
    await expect(page.getByText("Demo", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("nothing can be created", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: /create new brand|new brand/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /new organization/i })).toHaveCount(0);

    await page.goto(`${organizationUrl()}/new`);
    await page.waitForURL(new RegExp(`${organizationUrl()}/settings$`), { timeout: 30_000 });
  });

  test("saving organization settings fails and says why", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings`);

    const nameField = page.getByLabel("Organization Name", { exact: true });
    await expect(nameField).toBeEnabled({ timeout: 30_000 });
    await nameField.fill("Renamed In Demo");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Edits are not allowed in demo mode.")).toBeVisible({ timeout: 30_000 });
  });

  test("the team page is not offered and not reachable", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings`);
    await expect(
      page.locator(`a[href="${organizationUrl()}/settings/members"][data-sidebar="menu-button"]`),
    ).toHaveCount(0);

    await page.goto(`${organizationUrl()}/settings/members`);
    await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
  });
});
