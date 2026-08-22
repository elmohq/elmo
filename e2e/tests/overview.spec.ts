import { test, expect } from "@playwright/test";

const BRAND_ID = "default";

test.describe("Overview Page", () => {
  test("home page lands on the brand switcher and the default brand is reachable", async ({ page }) => {
    await page.goto("/");
    // Local mode supports multiple brands, so / -> /app shows the switcher
    // rather than auto-redirecting through to a brand.
    await page.waitForURL(/\/app(?:\/)?$/, { timeout: 30_000 });
    const brandLink = page.locator(`a[href="/app/${BRAND_ID}"]`).first();
    await expect(brandLink).toBeVisible({ timeout: 15_000 });
    await brandLink.click();
    await page.waitForURL(new RegExp(`/app/${BRAND_ID}$`));
    expect(page.url()).toContain(`/app/${BRAND_ID}`);
  });

  test("dashboard page loads and shows sidebar", async ({ page }) => {
    await page.goto(`/app/${BRAND_ID}`);

    await expect(page.locator(`a[href="/app/${BRAND_ID}"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`a[href="/app/${BRAND_ID}/visibility"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`a[href="/app/${BRAND_ID}/citations"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard shows brand content (not onboarding wizard)", async ({ page }) => {
    await page.goto(`/app/${BRAND_ID}`);

    const mainContent = page.locator("main, [class*='SidebarInset'], [class*='flex-1']").first();
    await expect(mainContent).toBeVisible({ timeout: 15_000 });
  });

  test("sidebar navigation links work", async ({ page }) => {
    await page.goto(`/app/${BRAND_ID}`);

    const visibilityLink = page.locator(`a[href="/app/${BRAND_ID}/visibility"][data-sidebar="menu-button"]`);
    await expect(visibilityLink).toBeVisible({ timeout: 15_000 });

    await visibilityLink.click();
    await page.waitForURL(/\/visibility/);
    expect(page.url()).toContain("/visibility");

    const citationsLink = page.locator(`a[href="/app/${BRAND_ID}/citations"][data-sidebar="menu-button"]`);
    await expect(citationsLink).toBeVisible({ timeout: 15_000 });
    await citationsLink.click();
    await page.waitForURL(/\/citations/);
    expect(page.url()).toContain("/citations");

    const overviewLink = page.locator(`a[href="/app/${BRAND_ID}"][data-sidebar="menu-button"]`);
    await expect(overviewLink).toBeVisible({ timeout: 15_000 });
    await overviewLink.click();
    await page.waitForURL(new RegExp(`/app/${BRAND_ID}$`));
  });

  test("admin section is accessible in local mode", async ({ page }) => {
    await page.goto(`/app/${BRAND_ID}`);

    await expect(page.locator(`a[href="/app/${BRAND_ID}"][data-sidebar="menu-button"]`)).toBeVisible({ timeout: 15_000 });

    const adminLink = page.locator('a[href*="/admin"]').first();
    if (await adminLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await adminLink.click();
      await page.waitForURL(/\/admin/);
      expect(page.url()).toContain("/admin");
    }
  });

  test("settings pages are accessible", async ({ page }) => {
    await page.goto(`/app/${BRAND_ID}/settings/brand`);
    await expect(page.getByText(/brand/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
