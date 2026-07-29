/**
 * Overview / Dashboard Page E2E Tests
 *
 * Tests that the main dashboard loads correctly, shows the brand layout
 * with sidebar navigation, and that basic navigation works.
 */
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

  test("sidebar navigation links work", async ({ page }) => {
    await page.goto(`/app/${BRAND_ID}`);

    // Wait for sidebar to be fully rendered before clicking
    const visibilityLink = page.locator(`a[href="/app/${BRAND_ID}/visibility"][data-sidebar="menu-button"]`);
    await expect(visibilityLink).toBeVisible({ timeout: 15_000 });

    // Click Visibility link in sidebar
    await visibilityLink.click();
    await page.waitForURL(/\/visibility/);
    expect(page.url()).toContain("/visibility");

    // Click Citations link in sidebar
    const citationsLink = page.locator(`a[href="/app/${BRAND_ID}/citations"][data-sidebar="menu-button"]`);
    await expect(citationsLink).toBeVisible({ timeout: 15_000 });
    await citationsLink.click();
    await page.waitForURL(/\/citations/);
    expect(page.url()).toContain("/citations");

    // Click Overview link in sidebar to go back
    const overviewLink = page.locator(`a[href="/app/${BRAND_ID}"][data-sidebar="menu-button"]`);
    await expect(overviewLink).toBeVisible({ timeout: 15_000 });
    await overviewLink.click();
    await page.waitForURL(new RegExp(`/app/${BRAND_ID}$`));
  });
});
