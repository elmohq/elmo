import { test, expect } from "@playwright/test";
import { brandUrl } from "../../fixtures";

const BRAND_URL = brandUrl();

test.describe("Overview Page", () => {
  test("home page lands on the directory and the default brand is reachable", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/app$/, { timeout: 30_000 });
    const brandLink = page.locator(`a[href="${BRAND_URL}"]`).first();
    await expect(brandLink).toBeVisible({ timeout: 15_000 });
    await brandLink.click();
    await page.waitForURL(new RegExp(`${BRAND_URL}$`));
    expect(page.url()).toContain(`${BRAND_URL}`);
  });

  test("dashboard page loads and shows sidebar", async ({ page }) => {
    await page.goto(`${BRAND_URL}`);

    await expect(page.locator(`a[href="${BRAND_URL}"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`a[href="${BRAND_URL}/visibility"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`a[href="${BRAND_URL}/citations"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard shows brand content (not onboarding wizard)", async ({ page }) => {
    await page.goto(`${BRAND_URL}`);

    const mainContent = page.locator("main, [class*='SidebarInset'], [class*='flex-1']").first();
    await expect(mainContent).toBeVisible({ timeout: 15_000 });
  });

  test("sidebar navigation links work", async ({ page }) => {
    await page.goto(`${BRAND_URL}`);

    const visibilityLink = page.locator(`a[href="${BRAND_URL}/visibility"][data-sidebar="menu-button"]`);
    await expect(visibilityLink).toBeVisible({ timeout: 15_000 });

    await visibilityLink.click();
    await page.waitForURL(/\/visibility/);
    expect(page.url()).toContain("/visibility");

    const citationsLink = page.locator(`a[href="${BRAND_URL}/citations"][data-sidebar="menu-button"]`);
    await expect(citationsLink).toBeVisible({ timeout: 15_000 });
    await citationsLink.click();
    await page.waitForURL(/\/citations/);
    expect(page.url()).toContain("/citations");

    const overviewLink = page.locator(`a[href="${BRAND_URL}"][data-sidebar="menu-button"]`);
    await expect(overviewLink).toBeVisible({ timeout: 15_000 });
    await overviewLink.click();
    await page.waitForURL(new RegExp(`${BRAND_URL}$`));
  });

  test("an admin can reach the admin brand list from the account menu", async ({ page }) => {
    await page.goto(`${BRAND_URL}`);

    await expect(page.locator(`a[href="${BRAND_URL}"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('a[href="/admin"][data-sidebar="menu-button"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Account and organizations" }).click();
    const adminLink = page.getByRole("menu").locator('a[href="/admin"]');
    await expect(adminLink).toBeVisible({ timeout: 15_000 });
    await adminLink.click();
    await page.waitForURL(/\/admin$/);

    await expect(page.locator('a[href="/admin/workflows"][data-sidebar="menu-button"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test("settings pages are accessible", async ({ page }) => {
    await page.goto(`${BRAND_URL}/settings/brand`);
    await expect(page.getByText(/brand/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
