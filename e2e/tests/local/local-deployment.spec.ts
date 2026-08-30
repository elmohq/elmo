/**
 * What makes a local (self-hosted) deployment different.
 *
 * A local instance is single-user by design: exactly one account is ever
 * created, there is no public signup, no team invitations, and no billing. It
 * ships the full report generator and the stock Elmo branding, and it lets the
 * operator create as many brands as they like.
 */
import { expect, test } from "@playwright/test";
import { TEST_BRAND_ID, TEST_USER, brandUrl, organizationUrl } from "../../fixtures";
import { userExists } from "../../session";

const SECOND_USER = {
  email: "second-user@test.local",
  password: "another-password-123",
  name: "Second User",
};

test.describe("Local signup is closed after bootstrap", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a second signup is rejected", async ({ request }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      data: SECOND_USER,
      failOnStatusCode: false,
    });

    expect(response.ok()).toBe(false);
    // The hook that refuses the signup runs before the row is written, so a
    // direct POST can't slip a second account past the UI's register guard.
    expect(await userExists(SECOND_USER.email)).toBe(false);
  });

  test("the register page sends you to sign in", async ({ page }) => {
    await page.goto("/auth/register");
    await page.waitForURL(/\/auth\/login/, { timeout: 30_000 });
  });

  test("sign in is email and password, with no cloud provider options", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /forgot password/i })).toHaveCount(0);
  });

  test("the bootstrap account can sign in", async ({ page }) => {
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/app/, { timeout: 30_000 });
  });
});

test.describe("Local features", () => {
  test("report generation is available", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: /reports/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("reports are in the account menu on a brand, and the organization's pages are its own", async ({ page }) => {
    await page.goto(`${brandUrl()}`);
    await expect(page.locator(`a[href="${brandUrl()}"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`a[href="${organizationUrl()}/settings/brands"][data-sidebar="menu-button"]`)).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Account and organizations" }).click();
    await expect(page.getByRole("menu").locator('a[href="/reports"]')).toBeVisible({ timeout: 30_000 });

    await page.goto(`${organizationUrl()}/settings`);
    await expect(
      page.locator(`a[href="${organizationUrl()}/settings/brands"][data-sidebar="menu-button"]`),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(`a[href="${organizationUrl()}/settings/billing"][data-sidebar="menu-button"]`)).toHaveCount(
      0,
    );
  });

  test("the team page is not offered and not reachable — a local install is one user", async ({ page }) => {
    await page.goto(`${organizationUrl()}/settings`);
    await expect(
      page.locator(`a[href="${organizationUrl()}/settings/members"][data-sidebar="menu-button"]`),
    ).toHaveCount(0);

    await page.goto(`${organizationUrl()}/settings/members`);
    await expect(page.getByText("404 Not Found")).toBeVisible({ timeout: 30_000 });
  });

  test("brands can be created from the UI", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: /new brand/i })).toBeVisible({ timeout: 30_000 });

    await page.goto(`${organizationUrl()}/new`);
    await expect(page.getByLabel("Brand Name")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Website")).toBeVisible();
  });

  test("organizations cannot be created — a local install has exactly one", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("link", { name: /new organization/i })).toHaveCount(0);

    await page.goto("/app/new");
    await page.waitForURL(/\/app$/, { timeout: 30_000 });
  });

  test("stock Elmo branding is used", async ({ page }) => {
    await page.goto(`${brandUrl()}`);

    // The Elmo wordmark, not a whitelabel icon + name.
    await expect(page.getByText("elmo", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    // Self-hosters get the version and project links a whitelabel build hides.
    await expect(page.locator('a[href="https://github.com/elmohq/elmo"]')).toBeVisible();
  });

  test("the web manifest carries the Elmo icons", async ({ request }) => {
    const response = await request.get("/api/manifest");
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as { short_name: string; icons: { src: string }[] };
    expect(manifest.short_name).toBe("Elmo");
    expect(manifest.icons.some((icon) => icon.src.startsWith("/icons/elmo-icon"))).toBe(true);
  });
});
